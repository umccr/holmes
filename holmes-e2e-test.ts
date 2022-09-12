import {
  StartExecutionCommand,
  SFNClient,
  DescribeExecutionCommand,
} from "@aws-sdk/client-sfn";
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import * as assert from "assert";
import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";

/*
 THESE SHOULD NOT BE SET TO TRUE IN ANY CHECKED IN VERSION
 */
// if you've had to reset the entire fingerprinting bucket - then set this to true for the first
// run afterwards - and it skips some assertions
const SKIP_EXISTING_DATA_ASSERTIONS = false;
// if working on developing the actual tests and don't want to force the fingerprint regenerate - can set this to true
const SKIP_DELETING_DATA = false;

/**
 * Does a relatedness check for the given BAM, with some assertions around how
 * we expect the results to be formatted. Then bundles up the results in a nicer
 * dictionary. NOTE: the index BAM *is not* returned in the result.
 *
 * @param stepsClient a steps AWS client
 * @param checkStepsArn the ARN of the checking step function
 * @param bamUrl the index BAM to check
 * @param excludeRegex if present sent as the exclude regex
 */
async function doFingerprintCheck(
  stepsClient: SFNClient,
  checkStepsArn: string,
  bamUrl: string,
  excludeRegex?: string
): Promise<{ [url: string]: number }> {
  const result = await doStepsExecution(stepsClient, checkStepsArn, {
    index: bamUrl,
    // note because we are doing trio testing we want to explicitly to be a pretty broad search
    relatednessThreshold: 0.4,
    excludeRegex: excludeRegex,
  });

  const related: { [url: string]: number } = {};
  let foundIndex = false;

  for (const m of result || []) {
    if (m.file == bamUrl) {
      foundIndex = true;

      assert.ok(
        m.relatedness == 1,
        `Index BAM ${bamUrl} should always be matched with relatedness of 1`
      );
    } else {
      related[m.file] = m.relatedness;
    }
  }

  assert.ok(foundIndex, `Index BAM ${bamUrl} should always match to itself`);

  return related;
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
    throw new Error("Step failed to execute");
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
      assert.fail("Steps execution failed in an unexpected way");

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
 * @param gdsBase the GDS URL for the base folder holding our test data
 * @param sitesChecksum the checksum of the sites file being used for testing
 * @param checkStepsArn the steps function for fingerprint checks
 * @param extractStepsArn the steps function for fingerprint creation
 * @param differenceStepsArn the steps function for detecting which fingerprints need creating
 */
export async function runTest(
  stepsClient: SFNClient,
  s3Client: S3Client,
  fingerprintBucket: string,
  gdsBase: string,
  sitesChecksum: string,
  checkStepsArn: string,
  extractStepsArn: string,
  differenceStepsArn: string
) {
  const INDIVIDUAL_96 = `${gdsBase}/individual/HG00096.bam`;
  const INDIVIDUAL_97 = `${gdsBase}/individual/HG00097.bam`;
  const INDIVIDUAL_99 = `${gdsBase}/individual/HG00099.bam`;
  const TRIO_SON = `${gdsBase}/family/giab_exome_trio/HG002-ready.bam`;
  const TRIO_FATHER = `${gdsBase}/family/giab_exome_trio/HG003-ready.bam`;
  const TRIO_MOTHER = `${gdsBase}/family/giab_exome_trio/HG004-ready.bam`;
  // the trio prefix is used to select which fingerprints to delete each run - we've chosen the trios
  // as they are 10GB BAMs which is a decent size but not huge
  const TRIO_PREFIX = "family/giab_exome_trio/HG00";

  if (!SKIP_DELETING_DATA) {
    // because we are deleting items from a bucket - we are being extra careful... so here - we are saying
    // we are only going to delete things that exactly match the size of our expected fingerprints
    // (this is obviously then brittle if the size of the fingerprints changes - if so, delete all the
    // fingerprints manually - and run the tests again - it will recreate them from scratch - then change
    // this number to the new fingerprint size)
    const FIXED_FINGERPRINT_SIZE = 207205;

    // as part of the test - we want to force the production of new fingerprints - which means we want to
    // delete from the bucket existing fingerprints produced in previous testing
    // we therefore make a known path in S3 we want to delete under
    // (this is definitely a case where the test case is aware of how the internal service works (i.e. how
    // it structures the buckets) - it is limited to prefixes that match the CUSTOM sites checksum and only
    // inside the fingerprint bucket - so we believe is safe
    const deleteFromPrefix = `${sitesChecksum}/${Buffer.from(
      `${gdsBase}/${TRIO_PREFIX}`,
      "ascii"
    ).toString("hex")}`;

    // we are going to start the testing by removing some fingerprints - basically making sure that for at least
    // some of our BAM files, that the fingerprints *do not* exist
    const listResponse = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: fingerprintBucket,
        Prefix: deleteFromPrefix,
      })
    );

    const toDelete = [];

    for (const s3object of listResponse.Contents || []) {
      if (s3object.Size == FIXED_FINGERPRINT_SIZE) toDelete.push(s3object.Key);
    }

    assert.ok(
      toDelete.length <= 3,
      "We should never delete more than 3 fingerprints from the trio so aborting test"
    );

    if (toDelete.length > 0) {
      await s3Client.send(
        new DeleteObjectsCommand({
          Bucket: fingerprintBucket,
          Delete: {
            Objects: toDelete.map((td) => {
              return {
                Key: td,
              };
            }),
          },
        })
      );
    }
  }

  const DIFF_CHUNK_SIZE = 2;

  console.log(CONSOLE_BREAK_LINE);
  console.log("DIFFERENCE TO DETECT ANY MISSING FINGERPRINTS");
  console.log(CONSOLE_BREAK_LINE);

  // we now want to do a Difference operation to see what is not fingerprinted
  const differenceResult = await doStepsExecution(
    stepsClient,
    differenceStepsArn,
    {
      // a dev chunk size of 2 means that when we re-process our trio - we should end up
      // with 2 on one ECS task (which tests out the multiple BAMs per task), and 1 on the other
      // (which tests out the fact we can spawn multiple tasks)
      devChunkSize: DIFF_CHUNK_SIZE,
    }
  );

  console.log(differenceResult);

  if (!SKIP_EXISTING_DATA_ASSERTIONS) {
    const needsFingerprinting: string[][] =
      differenceResult.needsFingerprinting;

    if (!SKIP_DELETING_DATA) {
      assert.ok(
        needsFingerprinting,
        "There should be three family members who need fingerprints"
      );
      assert.ok(
        needsFingerprinting.length == DIFF_CHUNK_SIZE,
        `There should be ${DIFF_CHUNK_SIZE} groups of fingerprint tasks to make`
      );

      const needsFingerprintingFlat = needsFingerprinting.reduce(
        (a: string[], b: string[]) => a.concat(b),
        []
      );

      assert.ok(
        needsFingerprintingFlat.length == 3,
        "There should be three family members who need fingerprints"
      );
      assert.ok(needsFingerprintingFlat.includes(TRIO_SON));
      assert.ok(needsFingerprintingFlat.includes(TRIO_FATHER));
      assert.ok(needsFingerprintingFlat.includes(TRIO_MOTHER));
    }

    const hasFingerprinting: string[] = differenceResult.hasFingerprinting;

    assert.ok(
      hasFingerprinting,
      "There should be some people who already have fingerprints"
    );

    assert.ok(
      hasFingerprinting.length == (SKIP_DELETING_DATA ? 6 : 3),
      "There should be an expected number of people who already have fingerprints"
    );
    assert.ok(hasFingerprinting.includes(INDIVIDUAL_96));
    assert.ok(hasFingerprinting.includes(INDIVIDUAL_97));
    assert.ok(hasFingerprinting.includes(INDIVIDUAL_99));
  }

  console.log(CONSOLE_BREAK_LINE);
  console.log("EXTRACT MISSING FINGERPRINTS");
  console.log(CONSOLE_BREAK_LINE);

  const extractResult = await doStepsExecution(
    stepsClient,
    extractStepsArn,
    differenceResult
  );

  console.log(extractResult);

  {
    console.log(CONSOLE_BREAK_LINE);
    console.log("SON CHECK");
    console.log(CONSOLE_BREAK_LINE);

    const sonCheck = await doFingerprintCheck(
      stepsClient,
      checkStepsArn,
      TRIO_SON
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

    const fatherCheck = await doFingerprintCheck(
      stepsClient,
      checkStepsArn,
      TRIO_FATHER
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

    const motherCheck = await doFingerprintCheck(
      stepsClient,
      checkStepsArn,
      TRIO_MOTHER
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

    const motherCheckRegex = await doFingerprintCheck(
      stepsClient,
      checkStepsArn,
      TRIO_MOTHER,
      `.*HG002.*`
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

    const nine6Check = await doFingerprintCheck(
      stepsClient,
      checkStepsArn,
      INDIVIDUAL_96
    );
    console.log(nine6Check);
    assert.ok(Object.keys(nine6Check).length == 0, "96 should match noone");
  }

  {
    console.log(CONSOLE_BREAK_LINE);
    console.log("INDIVIDUAL 97 CHECK");
    console.log(CONSOLE_BREAK_LINE);

    const nine7Check = await doFingerprintCheck(
      stepsClient,
      checkStepsArn,
      INDIVIDUAL_97
    );
    console.log(nine7Check);
    assert.ok(Object.keys(nine7Check).length == 0, "97 should match noone");
  }

  {
    console.log(CONSOLE_BREAK_LINE);
    console.log("INDIVIDUAL 99 CHECK");
    console.log(CONSOLE_BREAK_LINE);

    const nine9Check = await doFingerprintCheck(
      stepsClient,
      checkStepsArn,
      INDIVIDUAL_99
    );
    console.log(nine9Check);
    assert.ok(Object.keys(nine9Check).length == 0, "99 should match noone");
  }
}

// we need to execute this with node options NODE_OPTIONS="--unhandled-rejections=strict"
// in order that the asserts() cause this test script to actually exit with a failure
(async () => {
  console.log(
    `Testing Holmes via role ${process.argv[2]} in bucket ${process.argv[3]} and BAMs from ${process.argv[4]} with sites checksummed ${process.argv[5]} and steps ${process.argv[6]} ${process.argv[7]} ${process.argv[8]}`
  );

  // annoyingly we have to bridge across from the build account - were we want to execute this test as part of
  // the codepipeline - to the dev account where the buckets/steps live (none of which have cross-account perms).
  // so the first argument we are passed is a role we can assume in dev that can do the actual AWS calls
  const stsClient = new STSClient({});

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
    process.argv[4],
    process.argv[5],
    process.argv[6],
    process.argv[7],
    process.argv[8]
  );
})();
