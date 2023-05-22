import { createWriteStream, existsSync } from "fs";
import {
  _Object,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListObjectsV2Output,
  S3Client,
} from "@aws-sdk/client-s3";
import { readFile } from "fs/promises";
import { createHash } from "crypto";
import { promisify } from "util";
import { pipeline as pipelineCallback } from "stream";
import { URL } from "url";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  DescribeExecutionCommand,
  SFNClient,
  StartExecutionCommand,
} from "@aws-sdk/client-sfn";

const s3Client = new S3Client({});

/**
 * Converts a fingerprint bucket key into the URL that that fingerprint
 * came from.
 *
 * @param fingerprintFolder a slash terminated folder (key) where the fingerprints are located in S3
 * @param key
 */
export function keyToUrl(fingerprintFolder: string, key: string): URL {
  if (!fingerprintFolder.endsWith("/"))
    throw new Error("Fingerprint folder must end with a slash");

  // the key is in the format fingerprintFolder/<hexencodedurl>
  if (!key.startsWith(fingerprintFolder)) {
    throw new Error(
      "Key did not belong to fingerprints portion of our fingerprint bucket"
    );
  }

  // decode the hex after the leading fingerprintFolder
  const buf = new Buffer(key.substring(fingerprintFolder.length), "hex");

  return new URL(buf.toString("utf8"));
}

/**
 * Turns a URL (of a BAM) into the key that its fingerprint would have
 * in the fingerprint bucket.
 *
 * @param fingerprintFolder the folder in S3 which contains fingerprints
 * @param url the URL of a bam
 * @returns a new key that is the key for this bam in our fingerprint db
 */
export function urlToKey(fingerprintFolder: string, url: URL) {
  if (!fingerprintFolder.endsWith("/"))
    throw new Error("Fingerprint folder must end with a slash");

  const buf = Buffer.from(url.toString(), "ascii");

  return `${fingerprintFolder}${buf.toString("hex")}`;
}

/**
 * Return true if a given file exists in S3 and is accessible to us.
 *
 * @param bucket
 * @param key
 */
export async function s3Exists(
  bucket: string | undefined,
  key: string | undefined
): Promise<boolean> {
  const bucketParams = {
    Bucket: bucket,
    Key: key,
  };

  const command = new HeadObjectCommand(bucketParams);

  try {
    const response = await s3Client.send(command);

    return true;
  } catch (e) {}

  return false;
}

/**
 * Download a file from S3 to a local file location, and if asked return the checksum of the file.
 *
 * @param bucket the bucket name of the S3 file to download
 * @param key the key name of the S3 file to download
 * @param output the local file path to output the downloaded file
 * @param doChecksum whether we should also MD5 sum the file once downloaded
 * @return the checksum of the file as a string (if asked) or undefined
 */
export async function s3Download(
  bucket: string | undefined,
  key: string | undefined,
  output: string,
  doChecksum: boolean = false
): Promise<string | undefined> {
  const bucketParams = {
    Bucket: bucket,
    Key: key,
  };

  // for dev/test purposes it is useful that we might already have these files in place - and to not
  // require the download (whether this be by putting them into the docker image, or mounting via docker fs)
  // in the real production case we would be expected to always be downloading
  if (existsSync(output)) {
    console.log(`${output} file was already in place so will skip downloading`);
  } else {
    if (!bucket || !key) {
      throw Error(
        `The corresponding environment variables telling us where to get ${output} were not present`
      );
    }
    const command = new GetObjectCommand(bucketParams);
    const response = await s3Client.send(command);

    const pipeline = promisify(pipelineCallback);

    await pipeline(
      response.Body as NodeJS.ReadableStream,
      createWriteStream(output)
    );

    console.log(`${output} was produced by downloading s3://${bucket}/${key}`);
  }

  if (doChecksum) {
    const data = await readFile(output);

    return createHash("md5").update(data).digest("hex");
  }

  return;
}

/**
 * List all the fingerprint files in a bucket for a given prefix.
 *
 * @param bucketName the bucket to list files from
 * @param prefix the prefix key to restrict the list to
 */
export async function* s3ListAllFiles(
  bucketName: string,
  prefix: string
): AsyncGenerator<_Object> {
  let contToken = undefined;

  let count = 0;

  do {
    const data: ListObjectsV2Output = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix,
        ContinuationToken: contToken,
      })
    );

    contToken = data.NextContinuationToken;

    if (data.IsTruncated)
      console.log(
        `S3 file list was truncated so going again with continuation ${contToken}`
      );

    for (const file of data.Contents || []) {
      count++;
      yield file;
    }
  } while (contToken);
}

/**
 * Generate a short term presigned link to the given S3 URL.
 *
 * @param s3url
 */
export async function s3Presign(s3url: string) {
  const _match = s3url.match(/^s3?:\/\/([^\/]+)\/?(.*?)$/);

  if (!_match) throw new Error("Bad S3 URL format");

  const command = new GetObjectCommand({
    Bucket: _match[1],
    Key: _match[2],
  });

  return await getSignedUrl(s3Client, command, { expiresIn: 2 * 60 * 60 });
}

/**
 * Execute a steps function and wait for the result (via polling)
 *
 * @param stepsClient a AWS SDK client for steps
 * @param stepsArn the ARN of the steps function to call
 * @param inp an input JSON object to pass to the steps
 */
export async function stepsDoExecution(
  stepsClient: SFNClient,
  stepsArn: string,
  inp: any
): Promise<any> {
  try {
    const stepExecuteResult = await stepsClient.send(
      new StartExecutionCommand({
        stateMachineArn: stepsArn,
        input: JSON.stringify(inp),
      })
    );

    if (!stepExecuteResult.executionArn) {
      console.log(stepExecuteResult);
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

      if (execResult.status == "ABORTED" || execResult.status == "FAILED") {
        console.log(execResult);
        throw new Error("Unexpected failure status");
      }

      if (execResult.status != "RUNNING") break;

      // wait a bit then repeat the polling
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    return stepResult;
  } catch (e) {
    console.error(e);
    throw new Error("Step failed to execute");
  }
}

/**
 * List all the fingerprint files in a bucket and folder.
 *
 * @param bucketName
 * @param fingerprintFolder
 */
export async function* s3ListAllFingerprintFiles(
  bucketName: string,
  fingerprintFolder: string
): AsyncGenerator<_Object> {
  const s3Client = new S3Client({});

  let contToken = undefined;

  do {
    const data: ListObjectsV2Output = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: fingerprintFolder,
        ContinuationToken: contToken,
      })
    );

    contToken = data.NextContinuationToken;

    for (const file of data.Contents || [])
      if (file.Key !== fingerprintFolder) yield file;
  } while (contToken);
}

export async function s3GetObjectAsJson(
  bucket: string,
  key: string
): Promise<any> {
  const s3Client = new S3Client({});

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const response = await s3Client.send(command);

  if (response.Body) return JSON.parse(await response.Body.transformToString());

  throw Error("Empty body response from s3GetObjectAsJson");
}
