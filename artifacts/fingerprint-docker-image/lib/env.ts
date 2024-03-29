import { env as envDict } from "process";
import { s3Download, s3ListAllFiles } from "./aws";

// by default, we obviously want this setup to work correctly in a standalone fargate/lambda
// HOWEVER, it is useful to be able to override these on an execution basis for local testing
// THIS IS STRICTLY FOR USE IN DEV SETUPS - THESE PATHS ARE NOT CHECKED OR WHITELISTED - BAD THINGS CAN
// HAPPEN IF YOU ARE LETTING PEOPLE INVOKE THIS AND LETTING THEM SET THE ENV VARIABLES

export const somalierBinary = envDict["SOMALIER"] || "/var/task/somalier";
export const somalierWork = envDict["SOMALIERTMP"] || "/tmp";

export const somalierSites = envDict["SOMALIERSITES"] || "/tmp/sites.vcf.gz";

export const somalierFasta = envDict["SOMALIERFASTA"] || "/tmp/reference.fa";
export const somalierFastaIndex =
  envDict["SOMALIERFASTA"] || "/tmp/reference.fa.fai";

// the following variables are set by the external configuration to point to known
// S3 bucket locations (these are CDK level settings for the installation of Holmes)

export const fingerprintBucketName = envDict["FINGERPRINT_BUCKET_NAME"];
export const fingerprintConfigFolder = envDict["FINGERPRINT_CONFIG_FOLDER"];

/**
 * For a given reference string (i.e. hg38) retrieve the relevant
 * data files. Will re-use files that are already present and has some ways
 * to allow this to happen in test using magic env variables.
 *
 * @param reference
 */
export async function safeGetFingerprintSites(
  reference: string
): Promise<[string, string]> {
  console.log("Settings are:");
  console.log(`Fingerprint bucket name = ${fingerprintBucketName}`);
  console.log(`Fingerprint config folder = ${fingerprintConfigFolder}`);

  if (!fingerprintBucketName)
    throw new Error(
      "A fingerprint bucket name must be defined as part of the stack (env FINGERPRINT_BUCKET_NAME)"
    );

  if (!fingerprintConfigFolder || !fingerprintConfigFolder.endsWith("/"))
    throw new Error(
      "A fingerprint config folder name ending in a slash must be defined as part of the stack (env FINGERPRINT_CONFIG_FOLDER)"
    );

  // given the reference passed in - we have a guess at what paths our corresponding objecst are at
  const estimatedSitesKey = `${fingerprintConfigFolder}sites.${reference}.vcf.gz`;
  const estimatedFastaKey = `${fingerprintConfigFolder}reference.${reference}.fa`;
  const estimatedFastaIndexKey = `${fingerprintConfigFolder}reference.${reference}.fa.fai`;

  // now loop through the config folder and determine which are present
  let foundSites = false,
    foundFasta = false,
    foundFastaIndex = false;

  for await (const s3Object of s3ListAllFiles(
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

  return [fingerprintBucketName, sitesChecksum];
}

/**
 * Discover the key values for all the control fingerprints in our config folder.
 */
export async function getFingerprintControlKeys(): Promise<
  Record<string, string>
> {
  const controls: Record<string, string> = {};

  if (!fingerprintBucketName)
    throw new Error(
      "A fingerprint bucket name must be defined as part of the stack (env FINGERPRINT_BUCKET_NAME)"
    );

  if (!fingerprintConfigFolder || !fingerprintConfigFolder.endsWith("/"))
    throw new Error(
      "A fingerprint config folder name ending in a slash must be defined as part of the stack (env FINGERPRINT_CONFIG_FOLDER)"
    );

  const EXPECTED_PREFIX = "control.";
  const EXPECTED_SUFFIX = ".bam.somalier";

  for await (const s3Object of s3ListAllFiles(
    fingerprintBucketName,
    fingerprintConfigFolder + EXPECTED_PREFIX
  )) {
    console.log(s3Object.Key);
    if (s3Object.Key && s3Object.Key.endsWith(EXPECTED_SUFFIX)) {
      controls[s3Object.Key] = s3Object.Key.slice(
        (fingerprintConfigFolder + EXPECTED_PREFIX).length
      ).slice(0, -EXPECTED_SUFFIX.length);
    }
  }

  return controls;
}
