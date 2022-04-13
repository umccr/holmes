import { env as envDict } from "process";
import { s3Download } from "./aws";

// by default, we obviously want this setup to work correctly in a standalone fargate/lambda
// HOWEVER, it is useful to be able to override these on an execution basis for local testing
// THIS IS STRICTLY FOR USE IN DEV SETUPS - THESE PATHS ARE NOT CHECKED OR WHITELISTED - BAD THINGS CAN
// HAPPEN IF YOU ARE LETTING PEOPLE INVOKE THIS AND LETTING THEM SET THE ENV VARIABLES

export const somalierBinary = envDict["SOMALIER"] || "/var/task/somalier";
export const somalierWork = envDict["SOMALIERTMP"] || "/tmp";

export const somalierSites = envDict["SOMALIERSITES"] || "/tmp/sites.vcf.gz";

export const somalierFasta = envDict["SOMALIERFASTA"] || "/tmp/reference.fasta";

// the following variables are set by the external configuration to point to known
// S3 bucket locations

export const somalierSitesBucketName = envDict["SITES_BUCKET_NAME"];
export const somalierSitesBucketKey = envDict["SITES_BUCKET_KEY"];

export const somalierFastaBucketName = envDict["FASTA_BUCKET_NAME"];
export const somalierFastaBucketKey = envDict["FASTA_BUCKET_KEY"];

export const fingerprintBucketName = envDict["FINGERPRINT_BUCKET_NAME"];

export function safeGetSources(): string[] {
  const sources = envDict["SOURCES"];

  if (!sources)
    throw new Error(
      "Source for the difference step must be defined as part of the stack"
    );

  return sources.split(" ");
}

export async function safeGetFingerprintSites(): Promise<[string, string]> {
  console.log("Settings are:");
  console.log(`Fingerprint bucket name = ${fingerprintBucketName}`);
  console.log(`Fasta bucket name = ${somalierFastaBucketName}`);
  console.log(`Fasta bucket key = ${somalierFastaBucketKey}`);
  console.log(`Sites bucket name = ${somalierSitesBucketName}`);
  console.log(`Sites bucket key = ${somalierSitesBucketKey}`);

  if (!fingerprintBucketName)
    throw new Error(
      "A finger print bucket name must be defined as part of the stack"
    );

  const sitesChecksum = await s3Download(
    somalierSitesBucketName,
    somalierSitesBucketKey,
    somalierSites,
    true
  );

  if (!sitesChecksum)
    throw new Error("A sites file must be defined as part of the stack");

  return [fingerprintBucketName, sitesChecksum];
}
