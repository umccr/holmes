import { s3ListAllFingerprintFiles, urlToKey } from "./lib/aws";
import { safeGetFingerprintSites } from "./lib/env";
import { chunk } from "./lib/misc";

type EventInput = {
  index: string;
  relatednessThreshold?: number;
  excludeRegex?: string;
};

// controls the concurrency of the checking - each lambda will be asked to do LAMBDA_CHUNK_SIZE
// fingerprints in one invoke... with as many invokes as needed to cover all the fingerprints
const LAMBDA_CHUNK_SIZE = 5;

// by default we want to avoid kinship detection in the checking - so setting this high
const DEFAULT_RELATEDNESS_THRESHOLD = 0.8;

export const lambdaHandler = async (ev: EventInput, context: any) => {
  if (!ev.index)
    throw new Error(
      "Check start must be passed a URL of the BAM to use as an index case"
    );

  const [fingerprintBucketName, sitesChecksum] =
    await safeGetFingerprintSites();

  console.log(`Sites checksum = ${sitesChecksum}`);

  const fingerprintKeySet = new Set<string>();

  for await (const file of s3ListAllFingerprintFiles(
    fingerprintBucketName,
    sitesChecksum
  )) {
    // we allow known patterns to be excluded entirely at the fingerprint discovery level
    // so they will not partake in the comparisions at all
    if (ev.excludeRegex) {
      if (RegExp(ev.excludeRegex).test(file.Key!)) continue;
    }

    fingerprintKeySet.add(file.Key!);
  }

  const indexAsKey = urlToKey(sitesChecksum, new URL(ev.index));

  console.log(`Fingerprint key set has ${fingerprintKeySet.size} members`);
  console.log(`Index file has key ${indexAsKey}`);

  if (!fingerprintKeySet.has(indexAsKey))
    throw new Error(
      "Check start, the index case for fingerprint checking must already have been fingerprinted itself before testing"
    );

  const allKeyArray = Array.from(fingerprintKeySet);

  return {
    index: ev.index,
    sitesChecksum: sitesChecksum,
    relatednessThreshold:
      ev.relatednessThreshold || DEFAULT_RELATEDNESS_THRESHOLD,
    fingerprintKeys: chunk(allKeyArray, LAMBDA_CHUNK_SIZE),
  };
};
