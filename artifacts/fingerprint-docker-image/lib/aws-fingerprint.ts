import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { fingerprintBucketName, somalierWork } from "./environment-constants";
import { streamToBuffer } from "./misc";
import { createWriteStream } from "fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

export type FingerprintDownloaded = {
  // the key of the fingerprint that was downloaded
  fingerprintKey: string;

  // the sample id that we inserted into the fingerprint
  generatedSampleId: string;

  // the path to the fingerprint locally on disk
  generatedPath: string;

  // if present, the date of when this fingerprint was created (stored in object metadata - not the actual object created date)
  fingerprintCreated?: Date;

  // the subject identifier for this fingerprint
  subjectIdentifier?: string;

  // the library identifier for this fingerprint
  libraryIdentifier?: string;

  // true if this fingerprint was identified as a control sample
  isControl?: boolean;
};

/**
 * Fetches a fingerprint (somalier) object from an object store and saves it to local
 * working directory. Along the way fixes the file so its somalier id is the left padded
 * 'count' (up to the previous sample id size). Returns other details of the
 * fingerprint that we might obtain from the metadata (things like the date of extraction etc).
 *
 * @param fingerprintKey the key in our fingerprint bucket of the fingerprint file to download
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
  fingerprintKey: string,
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

  const result: FingerprintDownloaded = {
    fingerprintKey: fingerprintKey,
    generatedPath: localPath,
    generatedSampleId: newSampleId,
  };

  // convert object metadata into useful fields for the checker
  if (data.Metadata) {
    const createdMeta = data.Metadata["fingerprint-created"];

    if (createdMeta)
      result.fingerprintCreated = new Date(Date.parse(createdMeta));
    else {
      // if nothing specified this way then use the S3 creation
      result.fingerprintCreated = data.LastModified;
    }

    const subjectMeta = data.Metadata["subject-identifier"];

    if (subjectMeta) result.subjectIdentifier = subjectMeta.trim();
    else {
      // we can have older samples that used to get subject ids from their filename
      const re = new RegExp(/.*(SBJ\d\d\d\d\d).*/);
      const r = fingerprintKey.match(re);
      if (r) result.subjectIdentifier = r[1];
    }

    const libraryMeta = data.Metadata["library-identifier"];

    if (libraryMeta) result.libraryIdentifier = libraryMeta.trim();
  }

  // let the caller know what sample id we ended up generating for matching back to the original BAM
  return result;
}
