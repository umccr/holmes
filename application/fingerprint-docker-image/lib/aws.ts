import { createWriteStream, existsSync } from "fs";
import {
  _Object,
  GetObjectCommand,
  ListObjectsV2Command,
  ListObjectsV2Output,
  S3Client,
} from "@aws-sdk/client-s3";
import { readFile } from "fs/promises";
import { createHash } from "crypto";
import { promisify } from "util";
import { pipeline as pipelineCallback } from "stream";
import { URL } from "url";

const s3Client = new S3Client({});

/**
 * Converts a fingerprint bucket key into the URL that that fingerprint
 * came from.
 *
 * @param sitesChecksum
 * @param key
 */
export function keyToUrl(sitesChecksum: string, key: string): URL {
  // the key is in the format <sitesChecksum>/<hexencodedurl>
  if (!key.startsWith(sitesChecksum + "/")) {
    throw new Error(
      "Key did not belong to the same sites file output we are expecting"
    );
  }

  // decode the hex after the leading <sitesChecksum>/
  const buf = new Buffer(key.substring(sitesChecksum.length + 1), "hex");

  return new URL(buf.toString("utf8"));
}

/**
 * Turns a URL (of a BAM) into the key that its fingerprint would have
 * in the fingerprint bucket.
 *
 * @param sitesChecksum
 * @param url
 */
export function urlToKey(sitesChecksum: string, url: URL) {
  const buf = Buffer.from(url.toString(), "ascii");

  return `${sitesChecksum}/${buf.toString("hex")}`;
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
  // in the real production case it is not expected that the file will exist
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
  }

  if (doChecksum) {
    const data = await readFile(output);

    return createHash("md5").update(data).digest("hex");
  }
}

/**
 * List all the fingerprint files in a bucket for a given sites file (identified by
 * its checksum).
 *
 * @param bucketName
 * @param sitesChecksum
 */
export async function* s3ListAllFingerprintFiles(
  bucketName: string,
  sitesChecksum: string
): AsyncGenerator<_Object> {
  let contToken = undefined;

  console.log("Starting - S3 file list");
  let count = 0;

  do {
    const data: ListObjectsV2Output = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: sitesChecksum,
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

  console.log(`Ending - S3 file list generated ${count} files`);
}
