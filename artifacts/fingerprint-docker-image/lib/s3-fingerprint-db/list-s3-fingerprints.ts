import { _Object } from "@aws-sdk/client-s3";
import { awsListObjects } from "../aws-list-objects";
import { S3Fingerprint } from "./s3-fingerprint";
import { headS3Fingerprint } from "./head-s3-fingerprint";

/**
 * Async generator for listing all the fingerprints
 * (with metadata) in a given bucket at a given prefix.
 *
 * @param fingerprintBucketName the bucket to list files from
 * @param fingerprintFolder the prefix key to restrict the list to
 */
export async function* listS3Fingerprints(
  fingerprintBucketName: string,
  fingerprintFolder: string
): AsyncGenerator<S3Fingerprint> {
  // we have metadata about each fingerprint but only accessible via HEAD
  // on each object
  // so we want to bulk do HEAD operations - but expecting to need to do 1000s
  // of these efficiently but playing nicely with S3
  const asyncObjects = awsListObjects(fingerprintBucketName, fingerprintFolder);

  // just a bridge to make our more general function work with pMapIterable
  const headBridge = (s3Object: _Object) =>
    headS3Fingerprint(
      fingerprintBucketName,
      fingerprintFolder,
      s3Object.Key!,
      s3Object.LastModified!
    );

  const pi = await import("p-map");

  for await (const post of pi.pMapIterable(asyncObjects, headBridge, {
    // what should this be?? who knows... had to simulate real fingerprint dbs in a unit test
    // so will set this in prod and adjust
    // S3 documentation talks of limits around 5500 HEAD/second
    // in practice our fingerprint db has around 5000 fingerprintsa
    concurrency: 1000,
  })) {
    yield post;
  }
}
