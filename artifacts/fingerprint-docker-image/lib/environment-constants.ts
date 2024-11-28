import { env as envDict } from "process";
import { s3Download } from "./aws-misc";
import { awsListObjects } from "./aws-list-objects";

// by default, we obviously want this setup to work correctly in a standalone fargate/lambda
// HOWEVER, it is useful to be able to override these on an execution basis for local testing
// THIS IS STRICTLY FOR USE IN DEV SETUPS - THESE PATHS ARE NOT CHECKED OR WHITELISTED - BAD THINGS CAN
// HAPPEN IF YOU ARE LETTING PEOPLE INVOKE THIS AND LETTING THEM SET THE ENVIRONMENT VARIABLES
// TO ARBITRARY VALUES

export const somalierBinary = envDict["SOMALIER"] || "/var/task/somalier";
export const somalierWork = envDict["SOMALIERTMP"] || "/tmp";

export const somalierSites = envDict["SOMALIERSITES"] || "/tmp/sites.vcf.gz";

export const somalierFasta = envDict["SOMALIERFASTA"] || "/tmp/reference.fa";
export const somalierFastaIndex =
  envDict["SOMALIERFASTAINDEX"] || "/tmp/reference.fa.fai";

// the following variables are set by the external configuration to point to known
// S3 bucket locations (these are CDK level settings for the installation of Holmes)

export const fingerprintBucketName = envDict["FINGERPRINT_BUCKET_NAME"];
export const fingerprintConfigFolder = envDict["FINGERPRINT_CONFIG_FOLDER"];

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

  for await (const s3Object of awsListObjects(
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
