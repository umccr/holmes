import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { S3Fingerprint } from "./s3-fingerprint";
import { s3FingerprintMetadataApply } from "./s3-fingerprint-metadata-apply";
import { keyToUrl } from "../aws-misc";

const s3Client = new S3Client({});

/**
 * Perform a HEAD operation on a fingerprint in our S3 fingerprint
 * db and return a strongly typed S3Fingerprint object.
 *
 * @param fingerprintBucketName
 * @param fingerprintFolder
 * @param s3Key
 */
export async function headS3Fingerprint(
  fingerprintBucketName: string,
  fingerprintFolder: string,
  s3Key: string
): Promise<S3Fingerprint> {
  return s3Client
    .send(
      new HeadObjectCommand({
        Bucket: fingerprintBucketName,
        Key: s3Key,
      })
    )
    .then((result) => {
      const f: S3Fingerprint = {
        bucket: fingerprintBucketName,
        key: s3Key,
        url: keyToUrl(fingerprintFolder, s3Key),
      };

      s3FingerprintMetadataApply(
        f,
        s3Key,
        result.LastModified,
        result.Metadata
      );

      return f;
    });
}
