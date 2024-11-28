import {
  _Object,
  ListObjectsV2Command,
  ListObjectsV2Output,
  S3Client,
} from "@aws-sdk/client-s3";

const s3Client = new S3Client({});

/**
 * Async generator for listing all the S3 objects
 * in a bucket for a given prefix. Basically converts
 * the paged output of ListObjectsV2 into an async
 * stream.
 *
 * @param bucketName the bucket to list files from
 * @param prefix the prefix key to restrict the list to
 */
export async function* awsListObjects(
  bucketName: string,
  prefix: string
): AsyncGenerator<_Object> {
  let contToken = undefined;

  do {
    const data: ListObjectsV2Output = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix,
        ContinuationToken: contToken,
      })
    );

    contToken = data.NextContinuationToken;

    for (const file of data.Contents || []) {
      // we want to skip returning "directory entries"
      if (file.Key && file.Key.endsWith("/")) continue;

      yield file;
    }
  } while (contToken);
}
