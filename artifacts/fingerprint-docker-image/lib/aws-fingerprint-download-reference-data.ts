import { s3Download } from "./aws-misc";
import {
  fingerprintBucketName,
  fingerprintConfigFolder,
  somalierFasta,
  somalierFastaIndex,
  somalierSites,
} from "./environment-constants";
import { awsListObjects } from "./aws-list-objects";

/**
 * For a given reference string (i.e. hg38) retrieve the relevant
 * data files. Will re-use files that are already present (i.e. already downloaded) and has some ways
 * to allow this to happen in test using magic env variables.
 *
 * @param reference
 */
export async function awsFingerprintDownloadReferenceData(
  reference: string
): Promise<[string, string, string]> {
  if (!fingerprintBucketName)
    throw new Error(
      "A fingerprint bucket name must be defined as part of the stack (env FINGERPRINT_BUCKET_NAME)"
    );

  if (!fingerprintConfigFolder || !fingerprintConfigFolder.endsWith("/"))
    throw new Error(
      "A fingerprint config folder name ending in a slash must be defined as part of the stack (env FINGERPRINT_CONFIG_FOLDER)"
    );

  // given the reference passed in - we have a guess at what paths our corresponding objects are at
  const estimatedSitesKey = `${fingerprintConfigFolder}sites.${reference}.vcf.gz`;
  const estimatedFastaKey = `${fingerprintConfigFolder}reference.${reference}.fa`;
  const estimatedFastaIndexKey = `${fingerprintConfigFolder}reference.${reference}.fa.fai`;

  // now loop through the config folder and determine which are present
  let foundSites = false,
    foundFasta = false,
    foundFastaIndex = false;

  for await (const s3Object of awsListObjects(
    fingerprintBucketName,
    fingerprintConfigFolder
  )) {
    if (estimatedSitesKey === s3Object.Key) foundSites = true;
    if (estimatedFastaKey === s3Object.Key) foundFasta = true;
    if (estimatedFastaIndexKey === s3Object.Key) foundFastaIndex = true;
  }

  if (!foundSites)
    throw new Error(
      `For reference ${reference} we would expect the existence of a file ${estimatedSitesKey} in our bucket`
    );
  if (!foundFasta)
    throw new Error(
      `For reference ${reference} we would expect the existence of a file ${estimatedFastaKey} in our bucket`
    );
  if (!foundFastaIndex)
    throw new Error(
      `For reference ${reference} we would expect the existence of a file ${estimatedFastaIndexKey} in our bucket`
    );

  const sitesChecksum = await s3Download(
    fingerprintBucketName,
    estimatedSitesKey,
    somalierSites,
    true
  );

  if (!sitesChecksum)
    throw new Error("A sites file must be defined as part of the stack");

  // download the reference genomes and index
  await s3Download(
    fingerprintBucketName,
    estimatedFastaKey,
    somalierFasta,
    false
  );

  await s3Download(
    fingerprintBucketName,
    estimatedFastaIndexKey,
    somalierFastaIndex,
    false
  );

  return [somalierSites, somalierFasta, somalierFastaIndex];
}
