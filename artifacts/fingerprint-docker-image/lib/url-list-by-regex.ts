import { keyToUrl, s3ListAllFiles } from "./aws";
import { fingerprintBucketName } from "./env";

/**
 * Find all URLs in the fingerprint database that match ANY
 * of the passed in regexes.
 *
 * @param regexes
 * @param fingerprintFolder
 */
export async function urlListByRegex(
  regexes: string[],
  fingerprintFolder: string
) {
  const result: string[] = [];

  const regexReals: RegExp[] = regexes.map((r) => RegExp(r));

  for await (const s3Object of s3ListAllFiles(
    fingerprintBucketName!,
    fingerprintFolder
  )) {
    if (!s3Object.Key) continue;

    // annoyingly we get back the 'folder' as well so skip that as it will fail the new URL()
    if (s3Object.Key === fingerprintFolder) continue;

    const url = keyToUrl(fingerprintFolder, s3Object.Key);

    let anyMatched = false;

    for (const r of regexReals) {
      if (r.test(url.toString())) {
        anyMatched = true;
        break;
      }
    }

    if (anyMatched) {
      console.log(s3Object);
      result.push(url.toString());
    }
  }

  return result;
}
