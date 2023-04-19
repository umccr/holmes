import {
  StartExecutionCommand,
  SFNClient,
  DescribeExecutionCommand,
} from "@aws-sdk/client-sfn";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import * as assert from "assert";
import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import * as crypto from "crypto";
import { writeFile } from "fs/promises";

/**
 * Trigger the extract of a single BAM, with logic to skip the
 * extract if the fingerprint already exists.
 *
 * @param stepsClient
 * @param s3Client
 * @param extractStepsArn
 * @param fingerprintBucket the bucket for all fingerprint activity
 * @param fingerprintFolder the test specific folder for fingerprints
 * @param bamUrl
 * @param reference
 */
async function doFingerprintExtract(
  stepsClient: SFNClient,
  s3Client: S3Client,
  extractStepsArn: string,
  fingerprintBucket: string,
  fingerprintFolder: string,
  bamUrl: string,
  reference: string
): Promise<any> {
  try {
    await s3Client.send(
      new GetObjectCommand({
        Bucket: fingerprintBucket,
        Key: fingerprintFolder + Buffer.from(bamUrl, "ascii").toString("hex"),
      })
    );

    console.log(
      `Skipping extract for ${bamUrl} as it already exists in test fingerprint db`
    );

    return Promise.resolve({});
  } catch (e: any) {
    if (e?.Code !== "NoSuchKey") {
      console.error(e);
      throw Error(
        "Unexpected S3 error trying to determine if fingerprint exists"
      );
    }

    const timeLabel = `EXTRACT ${bamUrl}`;
    console.time(timeLabel);

    // we actually expect normally to get here... (the skip file thing is only of use when we are actually working on the tests themselves)
    return doStepsExecution(stepsClient, extractStepsArn, {
      indexes: [bamUrl],
      fingerprintFolder: fingerprintFolder,
      reference: reference,
    }).then(() => {
      console.timeEnd(timeLabel);
    });
  }
}

/**
 * Does a relatedness check for the given BAM, with some assertions around how
 * we expect the results to be formatted. Then bundles up the results in a nicer
 * dictionary. NOTE: the index BAM *is not* returned in the result.
 *
 * @param stepsClient a steps AWS client
 * @param checkStepsArn the ARN of the checking step function
 * @param fingerprintBucket the bucket for all fingerprint activity
 * @param fingerprintFolder the test specific folder for fingerprints
 * @param bamUrl the index BAM to check
 * @param excludeRegex if present sent as the exclude regex
 * @param expectRelatedRegex if present sent as the expected related regex
 */
async function doFingerprintCheck(
  stepsClient: SFNClient,
  checkStepsArn: string,
  fingerprintBucket: string,
  fingerprintFolder: string,
  bamUrl: string,
  excludeRegex?: string,
  expectRelatedRegex?: string
): Promise<[{ [url: string]: number }, { [url: string]: number }]> {
  const result = await doStepsExecution(stepsClient, checkStepsArn, {
    indexes: [bamUrl],
    // note because we are doing trio testing we want to explicitly to be a pretty broad search
    relatednessThreshold: 0.4,
    // a low n count for tests helps us - for real usage probably needs to be higher
    minimumNCount: 10,
    fingerprintFolder: fingerprintFolder,
    excludeRegex: excludeRegex,
    expectRelatedRegex: expectRelatedRegex,
  });

  let ourResults = [];

  // due to the way our steps engine splits checking - our results come back as a set of blocks - each block *might* have some results for us
  for (const resultBlock of result) {
    if (bamUrl in resultBlock) ourResults.push(...resultBlock[bamUrl]);
  }

  if (!ourResults)
    throw new Error(
      "Fingerprint check should return an array of dictionaries where at least one is keyed by the submitted index bams"
    );

  // our results will be an array of MatchBlocks - where each match is a relation from index to something
  // we tidy this up into a neat dictionary

  const related: { [url: string]: number } = {};
  const unrelated: { [url: string]: number } = {};

  let foundIndex = false;

  for (const m of ourResults || []) {
    if (m.file == bamUrl) {
      foundIndex = true;

      assert.ok(
        m.relatedness == 1,
        `Index BAM ${bamUrl} should always be matched with relatedness of 1`
      );
    } else {
      if (m.relatedness) related[m.file] = m.relatedness;
      else if (m.unrelatedness) unrelated[m.file] = m.unrelatedness;
      else
        assert.fail(
          "A check result returned a match that was neither related not unrelated"
        );
    }
  }

  assert.ok(foundIndex, `Index BAM ${bamUrl} should always match to itself`);

  return [related, unrelated];
}

/**
 * Does the generation of a pairs report on the passed in bams.
 *
 * @param stepsClient a steps AWS client
 * @param pairsStepsArn the ARN of the pairs step function
 * @param fingerprintBucket the bucket for all fingerprint activity
 * @param fingerprintFolder the test specific folder for fingerprints
 * @param bamUrls the BAMs to examine
 */
async function doFingerprintPairs(
  stepsClient: SFNClient,
  pairsStepsArn: string,
  fingerprintBucket: string,
  fingerprintFolder: string,
  bamUrls: string[]
): Promise<any> {
  const result = await doStepsExecution(stepsClient, pairsStepsArn, {
    indexes: bamUrls,
    fingerprintFolder: fingerprintFolder,
  });

  return result;
}

/**
 * A simple Steps waiter function - using polling - due to the AWS client libraries having
 * no way of invoking a steps function and waiting for it to finish.
 *
 * @param stepsClient a Steps client
 * @param stepsArn the step function to execute
 * @param inp the input to the steps execution
 */
async function doStepsExecution(
  stepsClient: SFNClient,
  stepsArn: string,
  inp: any
): Promise<any> {
  const stepExecuteResult = await stepsClient.send(
    new StartExecutionCommand({
      stateMachineArn: stepsArn,
      input: JSON.stringify(inp),
    })
  );

  if (!stepExecuteResult.executionArn) {
    throw new Error(
      `Steps ${stepsArn} failed to execute with input ${JSON.stringify(inp)}`
    );
  }

  let stepResult: any = {};

  while (true) {
    const execResult = await stepsClient.send(
      new DescribeExecutionCommand({
        executionArn: stepExecuteResult.executionArn,
      })
    );

    if (execResult.output) {
      stepResult = JSON.parse(execResult.output);
    }

    if (execResult.status == "ABORTED" || execResult.status == "FAILED")
      throw new Error(
        `Steps ${stepsArn} failed with status ${
          execResult.status
        } from input ${JSON.stringify(inp)}`
      );

    if (execResult.status != "RUNNING") break;

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  return stepResult;
}

const CONSOLE_BREAK_LINE = "-----------------------";

/**
 * Run an E2E test suite for Holmes fingerprinting.
 *
 * @param stepsClient
 * @param s3Client
 * @param fingerprintBucket the bucket holding test fingerprints
 * @param fingerprintFolder the test folder in the bucket where fingerprinting will happen
 * @param gdsBase the GDS URL for the base folder holding our test data
 * @param checkStepsArn the steps function for fingerprint checks
 * @param extractStepsArn the steps function for fingerprint creation
 * @param pairsStepsArn the pairs function for fingerprint creation
 */
export async function runTest(
  stepsClient: SFNClient,
  s3Client: S3Client,
  fingerprintBucket: string,
  fingerprintFolder: string,
  gdsBase: string,
  checkStepsArn: string,
  extractStepsArn: string,
  pairsStepsArn: string
) {
  const INDIVIDUAL_96 = `${gdsBase}/individual/HG00096.bam`;
  const INDIVIDUAL_97 = `${gdsBase}/individual/HG00097.bam`;
  const INDIVIDUAL_99 = `${gdsBase}/individual/HG00099.bam`;
  const TRIO_SON = `${gdsBase}/family/giab_exome_trio/HG002-ready.bam`;
  const TRIO_FATHER = `${gdsBase}/family/giab_exome_trio/HG003-ready.bam`;
  const TRIO_MOTHER = `${gdsBase}/family/giab_exome_trio/HG004-ready.bam`;
  const CTDNA = `${gdsBase}/ctdna/PTC_ctTSO220404_L2200417.bam`;

  console.log(CONSOLE_BREAK_LINE);
  console.log("EXTRACT TESTS");
  console.log(CONSOLE_BREAK_LINE);

  // add in extractors for all the HG38 samples
  const allExtractPromises = [
    INDIVIDUAL_96,
    INDIVIDUAL_97,
    INDIVIDUAL_99,
    TRIO_SON,
    TRIO_FATHER,
    TRIO_MOTHER,
  ].map((bam) =>
    doFingerprintExtract(
      stepsClient,
      s3Client,
      extractStepsArn,
      fingerprintBucket,
      fingerprintFolder,
      bam,
      "hg38.rna"
    )
  );

  // add in extraction for HG19 sample(s)
  allExtractPromises.push(
    doFingerprintExtract(
      stepsClient,
      s3Client,
      extractStepsArn,
      fingerprintBucket,
      fingerprintFolder,
      CTDNA,
      "hg19.rna"
    )
  );

  await Promise.all(allExtractPromises);

  {
    console.log(CONSOLE_BREAK_LINE);
    console.log("SON CHECK");
    console.log(CONSOLE_BREAK_LINE);

    const [sonCheck, _] = await doFingerprintCheck(
      stepsClient,
      checkStepsArn,
      fingerprintBucket,
      fingerprintFolder,
      TRIO_SON,
      "ctdna"
    );

    console.log(sonCheck);

    assert.ok(Object.keys(sonCheck).length == 2, "Son should match 2 people");
    assert.ok(
      sonCheck[TRIO_FATHER] > 0.4 && sonCheck[TRIO_FATHER] < 0.6,
      "Son/father relation not found"
    );
    assert.ok(
      sonCheck[TRIO_MOTHER] > 0.4 && sonCheck[TRIO_MOTHER] < 0.6,
      "Son/mother relation not found"
    );
  }

  {
    console.log(CONSOLE_BREAK_LINE);
    console.log("FATHER CHECK");
    console.log(CONSOLE_BREAK_LINE);

    const [fatherCheck, _] = await doFingerprintCheck(
      stepsClient,
      checkStepsArn,
      fingerprintBucket,
      fingerprintFolder,
      TRIO_FATHER,
      "ctdna"
    );

    console.log(fatherCheck);

    assert.ok(
      Object.keys(fatherCheck).length == 1,
      "Father should match 1 person"
    );
    assert.ok(
      fatherCheck[TRIO_SON] > 0.4 && fatherCheck[TRIO_SON] < 0.6,
      "Father/son relation not found"
    );
  }

  {
    console.log(CONSOLE_BREAK_LINE);
    console.log("MOTHER CHECK");
    console.log(CONSOLE_BREAK_LINE);

    const [motherCheck, _] = await doFingerprintCheck(
      stepsClient,
      checkStepsArn,
      fingerprintBucket,
      fingerprintFolder,
      TRIO_MOTHER,
      "ctdna"
    );

    console.log(motherCheck);

    assert.ok(
      Object.keys(motherCheck).length == 1,
      "Mother should match 1 person"
    );
    assert.ok(
      motherCheck[TRIO_SON] > 0.4 && motherCheck[TRIO_SON] < 0.6,
      "Mother/son relation not found"
    );
  }

  {
    console.log(CONSOLE_BREAK_LINE);
    console.log("MOTHER CHECK WITH REGEX EXCLUDE");
    console.log(CONSOLE_BREAK_LINE);

    const [motherCheckRegex, _] = await doFingerprintCheck(
      stepsClient,
      checkStepsArn,
      fingerprintBucket,
      fingerprintFolder,
      TRIO_MOTHER,
      `HG002|ctdna`
    );

    console.log(motherCheckRegex);

    assert.ok(
      Object.keys(motherCheckRegex).length == 0,
      "Mother should match 0 person because the child was regex excluded"
    );
  }

  {
    console.log(CONSOLE_BREAK_LINE);
    console.log("INDIVIDUAL 96 CHECK");
    console.log(CONSOLE_BREAK_LINE);

    const [nine6Check, _] = await doFingerprintCheck(
      stepsClient,
      checkStepsArn,
      fingerprintBucket,
      fingerprintFolder,
      INDIVIDUAL_96
    );
    console.log(nine6Check);
    assert.ok(Object.keys(nine6Check).length == 0, "96 should match noone");
  }

  {
    console.log(CONSOLE_BREAK_LINE);
    console.log("INDIVIDUAL 97 CHECK");
    console.log(CONSOLE_BREAK_LINE);

    const [nine7Check, _] = await doFingerprintCheck(
      stepsClient,
      checkStepsArn,
      fingerprintBucket,
      fingerprintFolder,
      INDIVIDUAL_97
    );
    console.log(nine7Check);
    assert.ok(Object.keys(nine7Check).length == 0, "97 should match noone");
  }

  {
    console.log(CONSOLE_BREAK_LINE);
    console.log("INDIVIDUAL 99 CHECK");
    console.log(CONSOLE_BREAK_LINE);

    const [nine9Check, _] = await doFingerprintCheck(
      stepsClient,
      checkStepsArn,
      fingerprintBucket,
      fingerprintFolder,
      INDIVIDUAL_99
    );
    console.log(nine9Check);
    assert.ok(Object.keys(nine9Check).length == 0, "99 should match noone");
  }

  {
    console.log(CONSOLE_BREAK_LINE);
    console.log("HG19 CTDNA CHECK");
    console.log(CONSOLE_BREAK_LINE);

    const [ctdnaRelatedCheck, ctnaUnrelatedCheck] = await doFingerprintCheck(
      stepsClient,
      checkStepsArn,
      fingerprintBucket,
      fingerprintFolder,
      CTDNA
    );
    console.log(ctdnaRelatedCheck);
    assert.ok(
      Object.keys(ctdnaRelatedCheck).length == 3,
      "cTDNA should match 3 people by virtue of it being derived from HG0002 cell line"
    );
    assert.ok(ctdnaRelatedCheck[TRIO_SON] >= 1, "ctDNA/son relation not found");
    assert.ok(
      ctdnaRelatedCheck[TRIO_FATHER] > 0.4 &&
        ctdnaRelatedCheck[TRIO_FATHER] < 0.7,
      "ctDNA/father relation not found"
    );
    assert.ok(
      ctdnaRelatedCheck[TRIO_MOTHER] > 0.4 &&
        ctdnaRelatedCheck[TRIO_MOTHER] < 0.7,
      "ctDNA/mother relation not found"
    );
  }

  {
    console.log(CONSOLE_BREAK_LINE);
    console.log("EXPECTED FAMILY REGEX CHECK");
    console.log(CONSOLE_BREAK_LINE);

    const [familyCheckRelated, familyCheckUnrelated] = await doFingerprintCheck(
      stepsClient,
      checkStepsArn,
      fingerprintBucket,
      fingerprintFolder,
      TRIO_FATHER,
      "ctdna",
      "(family)"
    );
    console.log(familyCheckRelated);
    console.log(familyCheckUnrelated);
    assert.ok(
      Object.keys(familyCheckRelated).length == 1 &&
        familyCheckRelated[TRIO_SON] > 0.4,
      "Family related should match 1 person - the son"
    );
    assert.ok(
      Object.keys(familyCheckUnrelated).length == 1 &&
        familyCheckUnrelated[TRIO_MOTHER] < 2,
      "Family unrelated should match 1 person - the mother"
    );
  }

  {
    console.log(CONSOLE_BREAK_LINE);
    console.log("ALL PAIRS REPORT");
    console.log(CONSOLE_BREAK_LINE);

    const ctdnaPairs = await doFingerprintPairs(
      stepsClient,
      pairsStepsArn,
      fingerprintBucket,
      fingerprintFolder,
      [INDIVIDUAL_96, TRIO_SON, TRIO_MOTHER, INDIVIDUAL_97, CTDNA]
    );

    assert.ok(
      ctdnaPairs.html.startsWith("<!DOCTYPE html>"),
      "Html pairs report not present"
    );

    // assert.ok(ctdnaPairs.key, 'Key to pairs report not present');
    //console.log("Key for report are");
    //console.log(ctdnaPairs.key);

    await writeFile("./pairs.html", ctdnaPairs.html);

    console.log(
      "Report saved to ./pairs.html - must visually confirm (should be report of everyone *except* TRIO_FATHER AND HG00099)"
    );
  }
}

// we need to execute this with node options NODE_OPTIONS="--unhandled-rejections=strict"
// in order that the asserts() cause this test script to actually exit with a failure
(async () => {
  const roleArn = process.argv[2];

  console.log(`
    Testing Holmes via role ${roleArn} in bucket ${process.argv[3]}
     and BAMs from ${process.argv[4]} and
      steps check ${process.argv[5]}
            extract ${process.argv[6]}
             pairs ${process.argv[7]}`);

  // we do the entire test suite in the context of a once-off fingerprint folder - though if specified on the command line we
  // can get it to re-use an existing folder (helps with test development to skip the extract phase)
  const fingerprintFolder = process.argv[8]
    ? process.argv[8]
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

    await runTest(
      stepsClient,
      s3Client,
      process.argv[3],
      fingerprintFolder,
      process.argv[4],
      process.argv[5],
      process.argv[6],

      process.argv[7]
    );
  } else {
    await runTest(
      new SFNClient({}),
      new S3Client({}),
      process.argv[3],
      fingerprintFolder,
      process.argv[4],
      process.argv[5],
      process.argv[6],
      process.argv[7]
    );
  }
})();
