import { downloadAndCorrectFingerprint } from "./somalier-download-run-clean";
import { urlToKey } from "./aws";
import { getFingerprintControlKeys } from "./env";
import { fi } from "date-fns/locale";

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

/**
 * Bring down a set of fingerprints for the 'control' samples that are
 * saved by convention in our config and return a map of how their
 * ids map to the control sample names.
 *
 * @param fingerprintFolder
 * @param startingSampleCount
 */
export async function downloadControlSamples(
  fingerprintFolder: string,
  startingSampleCount: number = 1
) {
  // as we download all the samples into this lambda context we assign them pseudo identifiers (of this count)
  let sampleCount = startingSampleCount;

  // download all the 'control' samples that we want to compare against everything else
  const fingerprintSampleIdToControlNameMap: { [sid: string]: string } = {};

  const controls = await getFingerprintControlKeys();

  console.log(JSON.stringify(controls, null, 2));

  for (const [controlKey, controlName] of Object.entries(controls)) {
    const newIndexSampleId = await downloadAndCorrectFingerprint(
      controlKey,
      sampleCount
    );
    fingerprintSampleIdToControlNameMap[newIndexSampleId] = controlName;
    sampleCount++;
  }

  console.log("Control samples found");
  console.log(JSON.stringify(fingerprintSampleIdToControlNameMap, null, 2));

  return fingerprintSampleIdToControlNameMap;
}
