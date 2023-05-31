import {
  DescribeExecutionCommand,
  SFNClient,
  StartExecutionCommand,
} from "@aws-sdk/client-sfn";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { fail } from "assert";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { toUtf8 } from "@aws-sdk/util-utf8";

/**
 * Trigger the extract of a single BAM, with logic to skip the
 * extract if the fingerprint already exists.
 *
 * @param stepsClient a configured Steps client
 * @param s3Client a configured S3 client
 * @param extractStepsArn the ARN of the extract Steps
 * @param fingerprintBucket the bucket for all fingerprint activity
 * @param fingerprintFolder the test specific folder for fingerprints
 * @param bamUrl the URL to extract
 * @param reference the id of the reference genome (hg19 or hg38)
 */
export async function doFingerprintExtract(
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
 * @param lambdaClient a lambda AWS client
 * @param checkLambdaArn the ARN of the checking lambda
 * @param fingerprintBucket the bucket for all fingerprint activity
 * @param fingerprintFolder the test specific folder for fingerprints
 * @param bamUrl the index BAM to check
 * @param excludeRegex if present sent as the exclude regex
 * @param expectRelatedRegex if present sent as the expected related regex
 */
export async function doFingerprintCheck(
  lambdaClient: LambdaClient,
  checkLambdaArn: string,
  fingerprintBucket: string,
  fingerprintFolder: string,
  bamUrl: string,
  excludeRegex?: string,
  expectRelatedRegex?: string
) {
  const lambaResult = await lambdaClient.send(
    new InvokeCommand({
      FunctionName: checkLambdaArn,
      InvocationType: "RequestResponse",
      Payload: Buffer.from(
        JSON.stringify({
          indexes: [bamUrl],
          // note because we are doing trio testing we want to explicitly to be a pretty broad search
          relatednessThreshold: 0.4,
          // a low n count for tests helps us - for real usage probably needs to be higher
          minimumNCount: 10,
          fingerprintFolder: fingerprintFolder,
          excludeRegex: excludeRegex,
          expectRelatedRegex: expectRelatedRegex,
        })
      ),
    })
  );

  if (!lambaResult.Payload)
    throw new Error("Fingerprint check lambda returned no payload");

  const result: Record<
    string,
    {
      self?: any;
      unexpectedRelated: any[];
      unexpectedUnrelated: any[];
      expectedRelated: any[];
    }
  > = JSON.parse(toUtf8(lambaResult.Payload));

  if (!result[bamUrl]) fail("The check BAM must appear in the result");

  if (!result[bamUrl]?.self)
    fail(
      "Every check should return a self consisting of the relationship to itself"
    );

  return result[bamUrl];
}

/**
 * Does a relate call
 *
 * @param lambdaClient a lambda AWS client
 * @param relateLambdaArn the ARN of the relate lambda
 * @param fingerprintBucket the bucket for all fingerprint activity
 * @param fingerprintFolder the test specific folder for fingerprints
 * @param bamUrls the index BAM to do a relate between
 */
export async function doFingerprintRelate(
  lambdaClient: LambdaClient,
  relateLambdaArn: string,
  fingerprintBucket: string,
  fingerprintFolder: string,
  bamUrls: string[]
) {
  const lambaResult = await lambdaClient.send(
    new InvokeCommand({
      FunctionName: relateLambdaArn,
      InvocationType: "RequestResponse",
      Payload: Buffer.from(
        JSON.stringify({
          indexes: bamUrls,
          fingerprintFolder: fingerprintFolder,
        })
      ),
    })
  );

  if (!lambaResult.Payload)
    throw new Error("Fingerprint relate lambda returned no payload");

  return JSON.parse(toUtf8(lambaResult.Payload));
}

/**
 * Does a relate call
 *
 * @param lambdaClient a lambda AWS client
 * @param listLambdaArn the ARN of the relate lambda
 * @param fingerprintBucket the bucket for all fingerprint activity
 * @param fingerprintFolder the test specific folder for fingerprints
 * @param regex the regex to list
 */
export async function doFingerprintList(
  lambdaClient: LambdaClient,
  listLambdaArn: string,
  fingerprintBucket: string,
  fingerprintFolder: string,
  regex: string
) {
  const lambaResult = await lambdaClient.send(
    new InvokeCommand({
      FunctionName: listLambdaArn,
      InvocationType: "RequestResponse",
      Payload: Buffer.from(
        JSON.stringify({
          regexes: [regex],
          fingerprintFolder: fingerprintFolder,
        })
      ),
    })
  );

  if (!lambaResult.Payload)
    throw new Error("Fingerprint list lambda returned no payload");

  return JSON.parse(toUtf8(lambaResult.Payload));
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
