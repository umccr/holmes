import { SFNClient } from "@aws-sdk/client-sfn";
import { S3Client } from "@aws-sdk/client-s3";
import * as assert from "assert";
import { fail } from "assert";
import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import * as crypto from "crypto";
import {
  DiscoverInstancesCommand,
  ServiceDiscoveryClient,
} from "@aws-sdk/client-servicediscovery";
import { LambdaClient } from "@aws-sdk/client-lambda";
import {
  doFingerprintCheck,
  doFingerprintExtract,
  doFingerprintList,
  doFingerprintRelate,
} from "./holmes-e2e-test-helper";

const CONSOLE_BREAK_LINE = "-----------------------";

/**
 * Run an E2E test suite for Holmes fingerprinting.
 *
 * @param stepsClient
 * @param s3Client
 * @param lambdaClient
 * @param serviceDiscoveryClient
 * @param namespaceName the namespace of the service
 * @param fingerprintBucket the bucket holding test fingerprints
 * @param fingerprintFolder the test folder in the bucket where fingerprinting will happen
 * @param gdsBase the GDS URL for the base folder holding our test data
 */
export async function runTest(
  stepsClient: SFNClient,
  s3Client: S3Client,
  lambdaClient: LambdaClient,
  serviceDiscoveryClient: ServiceDiscoveryClient,
  namespaceName: string,
  fingerprintBucket: string,
  fingerprintFolder: string,
  gdsBase: string
) {
  // first lets discover the services that we want to test
  const instances = await serviceDiscoveryClient.send(
    new DiscoverInstancesCommand({
      NamespaceName: namespaceName,
      ServiceName: "fingerprint",
    })
  );

  if (!instances.Instances || instances.Instances.length != 1)
    throw new Error(
      `Expecting to find only one instance of the fingerprint service in CloudMap ${namespaceName}`
    );

  const extractStepsArn =
    instances?.Instances[0]?.Attributes?.["extractStepsArn"];
  const checkLambdaArn =
    instances?.Instances[0]?.Attributes?.["checkLambdaArn"];
  const listLambdaArn = instances?.Instances[0]?.Attributes?.["listLambdaArn"];
  const relateLambdaArn =
    instances?.Instances[0]?.Attributes?.["relateLambdaArn"];

  if (!extractStepsArn) throw new Error("Missing extractStepsArn in CloudMap");
  if (!checkLambdaArn) throw new Error("Missing checkLambdaArn in CloudMap");
  if (!listLambdaArn) throw new Error("Missing listLambdaArn in CloudMap");
  if (!relateLambdaArn) throw new Error("Missing relateLambdaArn in CloudMap");

  const INDIVIDUAL_96 = `${gdsBase}/individual/HG00096.bam`;
  const INDIVIDUAL_96_ID = "HG00096";
  const INDIVIDUAL_97 = `${gdsBase}/individual/HG00097.bam`;
  const INDIVIDUAL_97_ID = "HG00097";
  const INDIVIDUAL_99 = `${gdsBase}/individual/HG00099.bam`;
  const INDIVIDUAL_99_ID = "HG00099";
  const TRIO_SON = `${gdsBase}/family/giab_exome_trio/HG002-ready.bam`;
  const TRIO_SON_ID = "HG002";
  const TRIO_FATHER = `${gdsBase}/family/giab_exome_trio/HG003-ready.bam`;
  const TRIO_FATHER_ID = "HG003";
  const TRIO_MOTHER = `${gdsBase}/family/giab_exome_trio/HG004-ready.bam`;
  const TRIO_MOTHER_ID = "HG004";
  const CTDNA = `${gdsBase}/ctdna/PTC_ctTSO220404_L2200417.bam`;
  const CELLPTC = `${gdsBase}/ptc/PTC_TsqN200511_N.bam`;

  console.log(CONSOLE_BREAK_LINE);
  console.log("EXTRACT TESTS");
  console.log(CONSOLE_BREAK_LINE);

  // add in extractors for all the HG38 samples
  const allExtractPromises = [
    [INDIVIDUAL_96, INDIVIDUAL_96_ID, "L654321"],
    [INDIVIDUAL_97, INDIVIDUAL_97_ID, "L111111"],
    [INDIVIDUAL_99, INDIVIDUAL_99_ID, "L222222"],
    [TRIO_SON, TRIO_SON_ID, "L333333"],
    [TRIO_FATHER, TRIO_FATHER_ID, "L444444"],
    [TRIO_MOTHER, TRIO_MOTHER_ID, "L123456"],
    [CELLPTC, "CELLPTC", "LXYX"],
  ].map((tuple) =>
    doFingerprintExtract(
      stepsClient,
      extractStepsArn,
      fingerprintFolder,
      tuple[0],
      tuple[1],
      tuple[2],
      "hg38.rna"
    )
  );

  // add in extraction for HG19 sample(s)
  allExtractPromises.push(
    doFingerprintExtract(
      stepsClient,
      extractStepsArn,
      fingerprintFolder,
      CTDNA,
      "CTDNA",
      "L2200417",
      "hg19.rna"
    )
  );

  await Promise.all(allExtractPromises);

  const findUnexpectedRelatedRelatedness = (r: any, bam: string) => {
    for (const a of r.unexpectedRelated) {
      if (a.file === bam) return a.relatedness;
    }
    fail(
      `Bam ${bam} was not found in the unexpected related array for the result`
    );
  };

  const findExpectedRelatedRelatedness = (r: any, bam: string) => {
    for (const a of r.expectedRelated) {
      if (a.file === bam) return a.relatedness;
    }
    fail(
      `Bam ${bam} was not found in the expected related array for the result`
    );
  };

  const findUnexpectedUnrelatedRelatedness = (r: any, bam: string) => {
    for (const a of r.unexpectedUnrelated) {
      if (a.file === bam) return a.relatedness;
    }
    fail(
      `Bam ${bam} was not found in the unexpected unrelated array for the result`
    );
  };

  {
    console.log(CONSOLE_BREAK_LINE);
    console.log("SON CHECK");
    console.log(CONSOLE_BREAK_LINE);

    const sonCheckResult = await doFingerprintCheck(
      lambdaClient,
      checkLambdaArn,
      fingerprintBucket,
      fingerprintFolder,
      TRIO_SON,
      "ctdna"
    );

    console.log(JSON.stringify(sonCheckResult, null, 2));

    assert.ok(
      sonCheckResult.unexpectedRelated.length == 2,
      "Son should match 2 people"
    );
    assert.ok(
      findUnexpectedRelatedRelatedness(sonCheckResult, TRIO_FATHER) > 0.4 &&
        findUnexpectedRelatedRelatedness(sonCheckResult, TRIO_FATHER) < 0.6,
      "Son/father relation not found"
    );
    assert.ok(
      findUnexpectedRelatedRelatedness(sonCheckResult, TRIO_MOTHER) > 0.4 &&
        findUnexpectedRelatedRelatedness(sonCheckResult, TRIO_MOTHER) < 0.6,
      "Son/mother relation not found"
    );
    console.log("Passed");
  }

  {
    console.log(CONSOLE_BREAK_LINE);
    console.log("FATHER CHECK");
    console.log(CONSOLE_BREAK_LINE);

    const fatherCheckResult = await doFingerprintCheck(
      lambdaClient,
      checkLambdaArn,
      fingerprintBucket,
      fingerprintFolder,
      TRIO_FATHER,
      // we exclude the Ctdna by name so we are just checking the family trio
      "ctdna"
    );

    console.log(JSON.stringify(fatherCheckResult, null, 2));

    assert.ok(
      fatherCheckResult.unexpectedRelated.length == 1,
      "Father should match 1 person"
    );
    assert.ok(
      findUnexpectedRelatedRelatedness(fatherCheckResult, TRIO_SON) > 0.4 &&
        findUnexpectedRelatedRelatedness(fatherCheckResult, TRIO_SON) < 0.6,
      "Father/son relation not found"
    );
    console.log("Passed");
  }

  {
    console.log(CONSOLE_BREAK_LINE);
    console.log("MOTHER CHECK");
    console.log(CONSOLE_BREAK_LINE);

    const motherCheckResult = await doFingerprintCheck(
      lambdaClient,
      checkLambdaArn,
      fingerprintBucket,
      fingerprintFolder,
      TRIO_MOTHER,
      "ctdna"
    );

    console.log(JSON.stringify(motherCheckResult, null, 2));

    assert.ok(
      motherCheckResult.unexpectedRelated.length == 1,
      "Mother should match 1 person"
    );
    assert.ok(
      findUnexpectedRelatedRelatedness(motherCheckResult, TRIO_SON) > 0.4 &&
        findUnexpectedRelatedRelatedness(motherCheckResult, TRIO_SON) < 0.6,
      "Mother/son relation not found"
    );
    console.log("Passed");
  }

  {
    console.log(CONSOLE_BREAK_LINE);
    console.log("MOTHER CHECK WITH REGEX EXCLUDE");
    console.log(CONSOLE_BREAK_LINE);

    const motherCheckRegexResult = await doFingerprintCheck(
      lambdaClient,
      checkLambdaArn,
      fingerprintBucket,
      fingerprintFolder,
      TRIO_MOTHER,
      `HG002|ctdna`
    );

    // console.log(JSON.stringify(motherCheckRegexResult, null, 2));

    assert.ok(
      motherCheckRegexResult.unexpectedRelated.length == 0,
      "Mother should match 0 person because the child was regex excluded"
    );
    console.log("Passed");
  }

  {
    console.log(CONSOLE_BREAK_LINE);
    console.log("INDIVIDUAL 96 CHECK");
    console.log(CONSOLE_BREAK_LINE);

    const nine6CheckResult = await doFingerprintCheck(
      lambdaClient,
      checkLambdaArn,
      fingerprintBucket,
      fingerprintFolder,
      INDIVIDUAL_96
    );

    //console.log(JSON.stringify(nine6CheckResult, null, 2));

    assert.ok(
      nine6CheckResult.unexpectedRelated.length == 0,
      "96 should match noone"
    );
    console.log("Passed");
  }

  {
    console.log(CONSOLE_BREAK_LINE);
    console.log("INDIVIDUAL 97 CHECK");
    console.log(CONSOLE_BREAK_LINE);

    const nine7CheckResult = await doFingerprintCheck(
      lambdaClient,
      checkLambdaArn,
      fingerprintBucket,
      fingerprintFolder,
      INDIVIDUAL_97
    );

    // console.log(JSON.stringify(nine7CheckResult, null, 2));

    assert.ok(
      nine7CheckResult.unexpectedRelated.length == 0,
      "97 should match noone"
    );
    console.log("Passed");
  }

  {
    console.log(CONSOLE_BREAK_LINE);
    console.log("INDIVIDUAL 99 CHECK");
    console.log(CONSOLE_BREAK_LINE);

    const nine9CheckResult = await doFingerprintCheck(
      lambdaClient,
      checkLambdaArn,
      fingerprintBucket,
      fingerprintFolder,
      INDIVIDUAL_99
    );

    //console.log(JSON.stringify(nine9CheckResult, null, 2));

    assert.ok(
      nine9CheckResult.unexpectedRelated.length == 0,
      "99 should match noone"
    );
    console.log("Passed");
  }

  {
    console.log(CONSOLE_BREAK_LINE);
    console.log("HG19 CTDNA CHECK");
    console.log(CONSOLE_BREAK_LINE);

    const ctdnaRelatedCheckResukt = await doFingerprintCheck(
      lambdaClient,
      checkLambdaArn,
      fingerprintBucket,
      fingerprintFolder,
      CTDNA
    );

    // console.log(JSON.stringify(ctdnaRelatedCheckResukt, null, 2));

    assert.ok(
      ctdnaRelatedCheckResukt.unexpectedRelated.length == 3,
      "cTDNA should match 3 people by virtue of it being derived from HG0002 cell line"
    );
    assert.ok(
      findUnexpectedRelatedRelatedness(ctdnaRelatedCheckResukt, TRIO_SON) >= 1,
      "ctDNA/son relation not found"
    );
    assert.ok(
      findUnexpectedRelatedRelatedness(ctdnaRelatedCheckResukt, TRIO_FATHER) >
        0.4 &&
        findUnexpectedRelatedRelatedness(ctdnaRelatedCheckResukt, TRIO_FATHER) <
          0.7,
      "ctDNA/father relation not found"
    );
    assert.ok(
      findUnexpectedRelatedRelatedness(ctdnaRelatedCheckResukt, TRIO_MOTHER) >
        0.4 &&
        findUnexpectedRelatedRelatedness(ctdnaRelatedCheckResukt, TRIO_MOTHER) <
          0.7,
      "ctDNA/mother relation not found"
    );

    console.log("Passed");
  }

  {
    console.log(CONSOLE_BREAK_LINE);
    console.log("EXPECTED FAMILY REGEX CHECK");
    console.log(CONSOLE_BREAK_LINE);

    const familyCheckResult = await doFingerprintCheck(
      lambdaClient,
      checkLambdaArn,
      fingerprintBucket,
      fingerprintFolder,
      TRIO_FATHER,
      "ctdna",
      "(family)"
    );

    //console.log(JSON.stringify(familyCheckResult, null, 2));

    assert.ok(
      familyCheckResult.expectedRelated.length == 1 &&
        findExpectedRelatedRelatedness(familyCheckResult, TRIO_SON) > 0.4,
      "Family related should match 1 person - the son"
    );
    assert.ok(
      familyCheckResult.unexpectedUnrelated.length == 1 &&
        findUnexpectedUnrelatedRelatedness(familyCheckResult, TRIO_MOTHER) < 2,
      "Family unrelated should match 1 person - the mother"
    );
    console.log("Passed");
  }

  {
    console.log(CONSOLE_BREAK_LINE);
    console.log("RELATE REPORT (SHOULD PRINT TWO TSVS)");
    console.log(CONSOLE_BREAK_LINE);

    const ctdnaReport = await doFingerprintRelate(
      lambdaClient,
      relateLambdaArn,
      fingerprintBucket,
      fingerprintFolder,
      [INDIVIDUAL_96, TRIO_SON, TRIO_MOTHER, INDIVIDUAL_97, CTDNA]
    );

    console.log(ctdnaReport["samplesTsv"]);
    console.log(ctdnaReport["pairsTsv"]);
  }

  {
    console.log(CONSOLE_BREAK_LINE);
    console.log("LIST (SHOULD PRINT LIST OF HG SAMPLES)");
    console.log(CONSOLE_BREAK_LINE);

    const listReport = await doFingerprintList(
      lambdaClient,
      listLambdaArn,
      fingerprintBucket,
      fingerprintFolder,
      "HG"
    );

    console.log(listReport);
  }
}

// we need to execute this with node options NODE_OPTIONS="--unhandled-rejections=strict"
// in order that the asserts() cause this test script to actually exit with a failure
(async () => {
  const roleArn = process.argv[2];

  console.log(`
    Testing Holmes via role ${roleArn} in bucket ${process.argv[3]}
     and BAMs from ${process.argv[4]} and for namespace ${process.argv[5]}`);

  // we do the entire test suite in the context of a once-off fingerprint folder - though if specified on the command line we
  // can get it to re-use an existing folder (helps with test development to skip the extract phase)
  const fingerprintFolder = process.argv[6]
    ? process.argv[6]
    : `fingerprints-test-${crypto.randomBytes(20).toString("hex")}/`;

  console.log(`Fingerprints will be created in folder ${fingerprintFolder}`);

  // annoyingly when running via CI we have to bridge across from the build account - were we want to execute this test as part of
  // the codepipeline - to the stg account where the buckets/steps live (none of which have cross-account perms).
  // so the first argument we are passed is a role we can assume in stg that can do the actual AWS calls
  const stsClient = new STSClient({});

  // if role arn is . then we skip the assume role
  if (roleArn != ".") {
    const assumeRoleResult = await stsClient.send(
      new AssumeRoleCommand({
        RoleArn: process.argv[2],
        RoleSessionName: "E2ETest",
      })
    );

    // we need to create clients suitable for the assumed role credentials
    const stepsClient = new SFNClient({
      credentials: {
        accessKeyId: assumeRoleResult.Credentials?.AccessKeyId!,
        secretAccessKey: assumeRoleResult.Credentials?.SecretAccessKey!,
        sessionToken: assumeRoleResult.Credentials?.SessionToken,
        expiration: assumeRoleResult.Credentials?.Expiration,
      },
    });
    const s3Client = new S3Client({
      credentials: {
        accessKeyId: assumeRoleResult.Credentials?.AccessKeyId!,
        secretAccessKey: assumeRoleResult.Credentials?.SecretAccessKey!,
        sessionToken: assumeRoleResult.Credentials?.SessionToken,
        expiration: assumeRoleResult.Credentials?.Expiration,
      },
    });
    const lambdaClient = new LambdaClient({
      credentials: {
        accessKeyId: assumeRoleResult.Credentials?.AccessKeyId!,
        secretAccessKey: assumeRoleResult.Credentials?.SecretAccessKey!,
        sessionToken: assumeRoleResult.Credentials?.SessionToken,
        expiration: assumeRoleResult.Credentials?.Expiration,
      },
    });
    const serviceDiscoveryClient = new ServiceDiscoveryClient({
      credentials: {
        accessKeyId: assumeRoleResult.Credentials?.AccessKeyId!,
        secretAccessKey: assumeRoleResult.Credentials?.SecretAccessKey!,
        sessionToken: assumeRoleResult.Credentials?.SessionToken,
        expiration: assumeRoleResult.Credentials?.Expiration,
      },
    });

    await runTest(
      stepsClient,
      s3Client,
      lambdaClient,
      serviceDiscoveryClient,
      process.argv[5],
      process.argv[3],
      fingerprintFolder,
      process.argv[4]
    );
  } else {
    // run the test with just regular credentials of the caller environment
    await runTest(
      new SFNClient({}),
      new S3Client({}),
      new LambdaClient({}),
      new ServiceDiscoveryClient({}),
      process.argv[5],
      process.argv[3],
      fingerprintFolder,
      process.argv[4]
    );
  }
})();
