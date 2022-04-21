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

const stepsClient = new SFNClient({});
const s3Client = new S3Client({});

async function doFingerprintCheck(checkStepsArn: string, bamUrl: string) {
  const result = await doStepsExecution(checkStepsArn, {
    index: bamUrl,
    // note because we are doing trio testing we want to explicitly to be a pretty broad search
    relatednessThreshold: 0.4,
  });

  console.log(result);
}

async function doStepsExecution(stepsArn: string, inp: any): Promise<any> {
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
      throw new Error("Steps execution failed in an unexpected way");

    if (execResult.status != "RUNNING") break;

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  return stepResult;
}

/**
 * Run an E2E test suite for Holmes fingerprinting.
 *
 * @param fingerprintBucket the bucket holding test fingerprints
 * @param gdsBase the GDS URL for the base folder holding our test data
 * @param sitesChecksum the checksum of the sites file being used for testing
 * @param checkStepsArn the steps function for fingerprint checks
 * @param extractStepsArn the steps function for fingerprint creation
 * @param differenceStepsArn the steps function for detecting which fingerprints need creating
 */
export async function runTest(
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
  const TRIO_CHILD = `${gdsBase}/family/giab_exome_trio/HG002-ready.bam`;
  const TRIO_MOTHER = `${gdsBase}/family/giab_exome_trio/HG003-ready.bam`;
  const TRIO_FATHER = `${gdsBase}/family/giab_exome_trio/HG004-ready.bam`;
  // the trio prefix is used to select which fingerprints to delete each run - we've chosen the trios
  // as they are 10GB BAMs which is a decent size but not huge
  const TRIO_PREFIX = "family/giab_exome_trio/HG00";

  // because we are deleting items from a bucket - we are being extra careful... so here - we are saying
  // we are only going to delete things that exactly match the size of our expected fingerprints
  // (this is obviously then brittle if the size of the fingerprints changes - if so, delete all the
  // fingerprints manually - and run the tests again - it will recreate them from scratch - then change
  // this number to the new fingerprint size)
  const FIXED_FINGERPRINT_SIZE = 207205;

  // if you've had to reset the entire fingerprinting bucket - then set this to true for the first
  // run afterwards
  const FIRST_RUN_MODE = false;

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

  console.log(toDelete);

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

  const DIFF_CHUNK_SIZE = 2;

  // we now want to do a Difference operation to see what is not fingerprinted
  const differenceResult = await doStepsExecution(differenceStepsArn, {
    // a dev chunk size of 2 means that when we re-process our trio - we should end up
    // with 2 on one ECS task (which tests out the multiple BAMs per task), and 1 on the other
    // (which tests out the fact we can spawn multiple tasks)
    devChunkSize: DIFF_CHUNK_SIZE,
  });

  console.log(differenceResult);

  if (!FIRST_RUN_MODE) {
    const needsFingerprinting: string[][] =
      differenceResult.needsFingerprinting;

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
    assert.ok(needsFingerprintingFlat.includes(TRIO_CHILD));
    assert.ok(needsFingerprintingFlat.includes(TRIO_MOTHER));
    assert.ok(needsFingerprintingFlat.includes(TRIO_FATHER));

    const hasFingerprinting: string[] = differenceResult.hasFingerprinting;

    assert.ok(
      hasFingerprinting,
      "There should be three individuals who already have fingerprints"
    );
    assert.ok(
      hasFingerprinting.length == 3,
      "There should be three individuals who already have fingerprints"
    );
    assert.ok(hasFingerprinting.includes(INDIVIDUAL_96));
    assert.ok(hasFingerprinting.includes(INDIVIDUAL_97));
    assert.ok(hasFingerprinting.includes(INDIVIDUAL_99));
  }

  //const extractResult = await doStepsExecution(
  //  extractStepsArn,
  //  differenceResult
  //);

  //console.log(extractResult);

  await doFingerprintCheck(checkStepsArn, TRIO_CHILD);

  await doFingerprintCheck(checkStepsArn, TRIO_MOTHER);

  await doFingerprintCheck(checkStepsArn, TRIO_FATHER);

  await doFingerprintCheck(checkStepsArn, INDIVIDUAL_96);
}

(async () => {
  console.log(
    `Testing Holmes with ${process.argv[2]} ${process.argv[3]} ${process.argv[4]} ${process.argv[5]} ${process.argv[6]} ${process.argv[7]}`
  );
  await runTest(
    process.argv[2],
    process.argv[3],
    process.argv[4],
    process.argv[5],
    process.argv[6],
    process.argv[7]
  );
})();
