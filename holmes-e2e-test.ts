import { StartExecutionCommand, SFNClient } from "@aws-sdk/client-sfn";
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";

const stepsClient = new SFNClient({});
const s3Client = new S3Client({});

async function doFingerprintCheck(checkStepsArn: string, bamUrl: string) {
  const checkStepResult = await stepsClient.send(
    new StartExecutionCommand({
      stateMachineArn: checkStepsArn,
      input: JSON.stringify({
        index: bamUrl,
      }),
    })
  );
}

/**
 * Run an E2E test suite for Holmes fingerprinting.
 *
 * @param fingerprintBucket the bucket holding test fingerprints
 * @param fingerprintPrefixToDelete a key prefix which we will delete all files matching, before regenerating
 * @param checkStepsArn
 * @param extractStepsArn
 * @param gatherStepsArn
 */
export async function runTest(
  fingerprintBucket: string,
  fingerprintPrefixToDelete: string,
  checkStepsArn: string,
  extractStepsArn: string,
  gatherStepsArn: string
) {
  // we are going to start the testing by removing some fingerprints - basically making sure that for at least
  // some of our BAM files, that the fingerprints *do not* exist
  await s3Client.send(
    new ListObjectsV2Command({
      Bucket: fingerprintBucket,
      Prefix: fingerprintPrefixToDelete,
    })
  );

  await s3Client.send(
    new DeleteObjectsCommand({
      Bucket: fingerprintBucket,
      Delete: {
        Objects: [
          {
            Key: "",
          },
        ],
      },
    })
  );

  // we now want to do a Gather operation to see what is not fingerprinted
  const gatherStepResult = await stepsClient.send(
    new StartExecutionCommand({
      stateMachineArn: gatherStepsArn,
      input: JSON.stringify({}),
    })
  );

  // and now we want to do an extract operation to generate some fingerprints
  const extractStepResult = await stepsClient.send(
    new StartExecutionCommand({
      stateMachineArn: extractStepsArn,
      input: JSON.stringify({}),
    })
  );

  // now we want to do the actual fingerprint calls with our expected results

  //await waitUntilBucketExists({ client, maxWaitTime: 60 }, { Bucket });
}

(async () => {
  console.log(`Testing with ${process.argv[2]} ${process.argv[3]}`);
  await runTest(
    process.argv[2],
    process.argv[3],
    process.argv[4],
    process.argv[5],
    process.argv[6]
  );
})();
