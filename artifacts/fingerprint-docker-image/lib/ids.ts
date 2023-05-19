import { downloadAndCorrectFingerprint } from "./somalier-download-run-clean";
import { urlToKey } from "./aws";

/**
 * Bring down a set of fingerprints for the given BAM urls and return
 * a map of how the new fingerprint ids map to the URLs.
 *
 * @param bamUrls
 * @param fingerprintFolder
 */
export async function downloadIndexSamples(
  bamUrls: string[],
  fingerprintFolder: string
) {
  // as we download all the samples into this lambda context we assign them pseudo identifiers (of this count)
  let sampleCount = 1;

  // download all the 'index' samples that we want to compare against everything else
  const indexSampleIdToBamUrlMap: { [sid: string]: string } = {};

  for (const indexAsBamUrl of bamUrls) {
    const newIndexSampleId = await downloadAndCorrectFingerprint(
      urlToKey(fingerprintFolder, new URL(indexAsBamUrl)),
      sampleCount
    );
    indexSampleIdToBamUrlMap[newIndexSampleId] = indexAsBamUrl;
    sampleCount++;
  }

  return indexSampleIdToBamUrlMap;
}
