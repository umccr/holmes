import { _Object } from "@aws-sdk/client-s3";
import { keyToUrl, s3ListAllFingerprintFiles, urlToKey } from "./aws";
import { safeGetFingerprintSites } from "./env";
import { chunk } from "./misc";

type EventInput = {
  index: string;
  relatednessThreshold: number;
};

// controls the concurrency of the checking - each lambda will be asked to do LAMBDA_CHUNK_SIZE
// fingerprints in one invoke... with as many invokes as needed to cover all the fingerprints
const LAMBDA_CHUNK_SIZE = 5;

export const lambdaHandler = async (ev: EventInput, context: any) => {
  const [fingerprintBucketName, sitesChecksum] =
    await safeGetFingerprintSites();

  const fingerprintKeySet = new Set<string>();

  for await (const file of s3ListAllFingerprintFiles(
    fingerprintBucketName,
    sitesChecksum
  )) {
    fingerprintKeySet.add(file.Key!);
  }

  const indexAsKey = urlToKey(sitesChecksum, new URL(ev.index));

  if (!fingerprintKeySet.has(indexAsKey))
    throw new Error(
      "The index case for fingerprint checking must already have been fingerprinted itself before testing"
    );

  const allKeyArray = Array.from(fingerprintKeySet);

  return {
    index: ev.index,
    sitesChecksum: sitesChecksum,
    relatednessThreshold: ev.relatednessThreshold,
    fingerprintKeys: chunk(allKeyArray, LAMBDA_CHUNK_SIZE),
  };
};
