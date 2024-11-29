import { keyToUrl } from "./aws-misc";
import { fingerprintBucketName } from "./environment-constants";
import { listS3Fingerprints } from "./s3-fingerprint-db/list-s3-fingerprints";
import { S3Fingerprint } from "./s3-fingerprint-db/s3-fingerprint";

/**
 * Find all URLs in the fingerprint database that match ANY
 * of the passed in regexes OR match a passed in index. Has a master
 * level excludeRegex that can fundamentally block out certain
 * files (like NTC or PTC)
 *
 * Also allows the regex to match
 * against portions of the printed date of modification of the
 * fingerprint - so that fingerprints can be extracted by day
 * (i.e. "2022-04-02") and by metadata individualId and libraryId.
 *
 * @param regexes an array of regexs of which ANY can match
 * @param indexes an array of URLs that can match directly as well
 * @param fingerprintFolder the folder the fingerprints are in
 * @param excludeRegex a possible regex used to exclude by filename
 */
export async function fingerprintListByRegex(
  regexes: string[],
  indexes: string[],
  fingerprintFolder: string,
  excludeRegex?: string
) {
  const result: S3Fingerprint[] = [];

  const regexReals: RegExp[] = regexes.map((r) => RegExp(r));
  const indexesSet = new Set<string>(indexes);

  const excludeRegexReal = excludeRegex ? RegExp(excludeRegex) : undefined;

  for await (const s3Fingerprint of listS3Fingerprints(
    fingerprintBucketName!,
    fingerprintFolder
  )) {
    if (!s3Fingerprint.key) continue;

    // annoyingly we may get back the 'folder' as well so skip that as it will fail the new URL()
    if (s3Fingerprint.key === fingerprintFolder) continue;

    const urlAsString = keyToUrl(
      fingerprintFolder,
      s3Fingerprint.key
    ).toString();

    // we have a useful feature to exclude entirely by regex
    if (excludeRegexReal) if (excludeRegexReal.test(urlAsString)) continue;

    // if the name of the URL was specified in the inputs then we immediately match
    if (indexesSet.has(urlAsString)) {
      result.push(s3Fingerprint);
      continue;
    }

    // we are looking for ANY of our regex to match the URL
    let anyMatched = false;

    for (const r of regexReals) {
      // I guess slightly unexpected - but useful - is we can also match by the date (or time)
      // our filenames don't really use the ISO YYYY-mm-dd format so they are relatively isolated from
      // matching both a filename and a date (though I guess a year like 2022 would match both dates
      // and some filenames *not* to do with the date.. but that would be too big anyhow)
      if (r.test(urlAsString)) {
        anyMatched = true;
        break;
      }

      if (s3Fingerprint.createdMelbourneDisplay) {
        if (r.test(s3Fingerprint.createdMelbourneDisplay)) {
          anyMatched = true;
          break;
        }
      }

      if (s3Fingerprint.libraryId) {
        if (r.test(s3Fingerprint.libraryId)) {
          anyMatched = true;
          break;
        }
      }

      if (s3Fingerprint.individualId) {
        if (r.test(s3Fingerprint.individualId)) {
          anyMatched = true;
          break;
        }
      }
    }

    if (anyMatched) {
      result.push(s3Fingerprint);
    }
  }

  return result;
}
