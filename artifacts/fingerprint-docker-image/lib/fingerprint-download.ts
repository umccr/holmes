import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { fingerprintBucketName, somalierWork } from "./environment-constants";
import { streamToBuffer } from "./misc";
import { createWriteStream } from "fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { s3FingerprintMetadataApply } from "./s3-fingerprint-db/s3-fingerprint-metadata-apply";
import { S3Fingerprint } from "./s3-fingerprint-db/s3-fingerprint";
import { keyToUrl } from "./aws-misc";

export type FingerprintDownloaded = S3Fingerprint & {
  // depending on where the input fingerprint key comes from - the "display"
  // of the fingerprint might be different. So instance, some fingerprints
  // are displayed as URLs ("s3://a-bucket/mine.bam"), whereas some control
  // fingerprints are displayed as "NA12345 control" (say)
  fingerprintDisplay: string;

  // the sample id that we inserted into the fingerprint
  generatedSampleId: string;

  // the path to the fingerprint locally on disk
  generatedPath: string;
};

/**
 * Fetches a fingerprint (somalier) object from an object store and saves it to local
 * working directory. Along the way fixes the file so its somalier id is the left padded
 * 'count' (up to the previous sample id size). Returns other details of the
 * fingerprint that we might obtain from the metadata (things like the date of extraction etc).
 *
 * @param fingerprintFolder the folder our fingerprints are in
 * @param fingerprintKey the key in our fingerprint bucket of the fingerprint file to download
 * @param fingerprintDisplay the display value of the key if needing reporting on downstream
 * @param count the count used to generate a new id
 * @return data about the newly created local fingerprint
 *
 * NOTE so somalier itself relies too heavily on the sample ids *inside* the fingerprint
 * files. This has two problems
 * (1) they might be wrong/set incorrectly on creation and we can't fix
 * (2) where they are identical - the output of somalier won't let us distinguish between two samples
 *     with the same id (i.e. we can't tell which BAM was which)
 * Which when the job of this is to detect incorrectly labelled samples - is a problem. So we
 * do some magic here to replace the inbuilt fingerprint sample ids with our own 'per run'
 * sample ids - and then match back to the original BAM.
 */
export async function downloadAndCorrectFingerprint(
  fingerprintFolder: string,
  fingerprintKey: string,
  fingerprintDisplay: string,
  count: number
): Promise<FingerprintDownloaded> {
  const s3Client = new S3Client({});

  let fileBuffer: Buffer | null = null;

  const data = await s3Client.send(
    new GetObjectCommand({
      Bucket: fingerprintBucketName,
      Key: fingerprintKey,
    })
  );

  fileBuffer = await streamToBuffer(data.Body);

  // check the file version matches what we expect
  const ver = fileBuffer.readInt8(0);
  if (ver !== 2)
    throw new Error(
      "Our fingerprint service is designed to only work with Somalier V2 fingerprint files"
    );

  // find out how much sample id space we have for our replacement sample ids
  const sampleIdLength = fileBuffer.readInt8(1);

  if (sampleIdLength < 2)
    throw new Error(
      "Due to the way we replace sample ids in Somalier we require all sample ids to be at least 2 characters for fingerprinting"
    );

  const newSampleId = count.toString().padStart(sampleIdLength, "0");
  fileBuffer.fill(newSampleId, 2, 2 + sampleIdLength);

  const localPath = `${somalierWork}/${newSampleId}.somalier`;
  // now stream the buffer we have edited out to disk
  let writeStream = createWriteStream(localPath);
  await pipeline(Readable.from(fileBuffer), writeStream);

  // our control fingerprints are a set of fingerprints that are actually not
  // URLs... so this hack handles them
  let u: URL | undefined;

  try {
    u = keyToUrl(fingerprintFolder, fingerprintKey);
  } catch (e) {
    u = undefined;
  }

  const result: FingerprintDownloaded = {
    bucket: fingerprintBucketName!,
    key: fingerprintKey,
    url: u,
    fingerprintDisplay: fingerprintDisplay,
    generatedPath: localPath,
    generatedSampleId: newSampleId,
  };

  // convert object metadata into useful fields for the checker
  if (data.Metadata) {
    s3FingerprintMetadataApply(
      result,
      fingerprintKey,
      data.LastModified,
      data.Metadata
    );
  }
  // let the caller know what sample id we ended up generating for matching back to the original BAM
  return result;
}
