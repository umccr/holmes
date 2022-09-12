import { keyToUrl, s3ListAllFingerprintFiles, urlToKey } from "./lib/aws";
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

  const indexUrl = new URL(ev.index);

  const [fingerprintBucketName, sitesChecksum] =
    await safeGetFingerprintSites();

  console.log(`Sites checksum = ${sitesChecksum}`);

  // because they are smaller in size - we chose to use the URLs (and not keys) as the
  // result of this lambda (we have to keep this set within 256kb for Steps quotas)
  const fingerprintUrlSet = new Set<string>();

  for await (const file of s3ListAllFingerprintFiles(
    fingerprintBucketName,
    sitesChecksum
  )) {
    // want the URL that created the fingerprint, not the fingerprint key itself
    const fileAsUrl = keyToUrl(sitesChecksum, file.Key!);

    // we allow known patterns to be excluded entirely at the fingerprint discovery level
    // so they will not partake in the comparisons at all
    if (ev.excludeRegex) {
      const res = RegExp(ev.excludeRegex).test(fileAsUrl.toString());

      if (res) {
        // if we have just thrown out the actual index case then we can't continue - mind as well give a decent
        // error message
        if (fileAsUrl == indexUrl)
          throw new Error(
            "Check start, the index case for fingerprint does exist as a fingerprint but is excluded via the regexp"
          );

        continue;
      }
    }

    fingerprintUrlSet.add(fileAsUrl.toString());
  }

  console.log(`Fingerprint URL set has ${fingerprintUrlSet.size} members`);
  console.log(`Index file is ${ev.index}`);

  if (!fingerprintUrlSet.has(ev.index))
    throw new Error(
      "Check start, the index case for fingerprint checking must already have been fingerprinted itself before testing"
    );

  const allKeyArray = Array.from(fingerprintUrlSet);

  return {
    index: ev.index,
    sitesChecksum: sitesChecksum,
    relatednessThreshold:
      ev.relatednessThreshold || DEFAULT_RELATEDNESS_THRESHOLD,
    fingerprintKeys: chunk(allKeyArray, LAMBDA_CHUNK_SIZE),
  };
};
