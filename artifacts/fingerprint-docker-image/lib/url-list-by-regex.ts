import { keyToUrl } from "./aws-misc";
import { fingerprintBucketName } from "./environment-constants";
import { formatInTimeZone } from "date-fns-tz";
import { awsListObjects } from "./aws-list-objects";

export type UrlListResult = {
  url: string;
  // obviously this is very specific to UMCCR - so would need to introduce a configurable
  // timezone string to support others
  lastModifiedMelbourne: string;
};

/**
 * Find all URLs in the fingerprint database that match ANY
 * of the passed in regexes OR match a passed in index. Has a master
 * level excludeRegex that can fundamentally block out certain
 * files (like NTC or PTC)
 *
 * Also allows the regex to match
 * against portions of the printed date of modification of the
 * fingerprint - so that fingerprints can be extracted by day
 * (i.e. "2022-04-02")
 *
 * @param regexes an array of regexs of which ANY can match
 * @param indexes an array of URLs that can match directly as well
 * @param fingerprintFolder the folder the fingerprints are in
 * @param excludeRegex a possible regex used to exclude by filename
 */
export async function urlListByRegex(
  regexes: string[],
  indexes: string[],
  fingerprintFolder: string,
  excludeRegex?: string
) {
  const result: UrlListResult[] = [];

  const regexReals: RegExp[] = regexes.map((r) => RegExp(r));
  const indexesSet = new Set<string>(indexes);

  const excludeRegexReal = excludeRegex ? RegExp(excludeRegex) : undefined;

  for await (const s3Object of awsListObjects(
    fingerprintBucketName!,
    fingerprintFolder
  )) {
    if (!s3Object.Key) continue;

    // annoyingly we get back the 'folder' as well so skip that as it will fail the new URL()
    if (s3Object.Key === fingerprintFolder) continue;

    const urlAsString = keyToUrl(fingerprintFolder, s3Object.Key).toString();

    if (excludeRegexReal) if (excludeRegexReal.test(urlAsString)) continue;

    const lm = s3Object.LastModified
      ? formatInTimeZone(
          s3Object.LastModified,
          "Australia/Melbourne",
          "yyyy-MM-dd HH:mm:ss zzz"
        )
      : "";

    // we are looking for ANY of our regex to match the URL
    let anyMatched = false;

    for (const r of regexReals) {
      // I guess slightly unexpected - but useful - is we can also match by the date (or time)
      // our filenames don't really use the ISO YYYY-mm-dd format so they are relatively isolated from
      // matching both a filename and a date (though I guess a year like 2022 would match both dates
      // and some filenames *not* to do with the date.. but that would be too big anyhow)
      if (r.test(urlAsString) || r.test(lm)) {
        anyMatched = true;
        break;
      }
    }

    if (anyMatched || indexesSet.has(urlAsString)) {
      result.push({
        url: urlAsString,
        lastModifiedMelbourne: lm,
      });
    }
  }

  return result;
}
