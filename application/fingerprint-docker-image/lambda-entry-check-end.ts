import { keyToUrl } from "./aws";
import { safeGetFingerprintSites } from "./env";

export const lambdaHandler = async (ev: any[], context: any) => {
  const [fingerprintBucketName, sitesChecksum] =
    await safeGetFingerprintSites();

  for (const entry of ev || []) {
    if (entry.file) {
      entry.file = keyToUrl(sitesChecksum, entry.file);
    }
  }

  return {
    matches: ev,
  };
};
