import { urlToKey } from "./aws-misc";
import { getFingerprintControlKeys } from "./environment-constants";
import {
  downloadAndCorrectFingerprint,
  FingerprintDownloaded,
} from "./aws-fingerprint";

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
  const indexSampleIdToBamUrlMap: { [sid: string]: FingerprintDownloaded } = {};

  for (const indexAsBamUrl of bamUrls) {
    const indexFingerprintDownloaded = await downloadAndCorrectFingerprint(
      urlToKey(fingerprintFolder, new URL(indexAsBamUrl)),
      indexAsBamUrl,
      sampleCount
    );
    indexSampleIdToBamUrlMap[indexFingerprintDownloaded.generatedSampleId] =
      indexFingerprintDownloaded;
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
  const fingerprintSampleIdToControlNameMap: {
    [sid: string]: FingerprintDownloaded;
  } = {};

  const controls = await getFingerprintControlKeys();

  for (const [controlKey, controlName] of Object.entries(controls)) {
    const controlFingerprintDownloaded = await downloadAndCorrectFingerprint(
      controlKey,
      controlName,
      sampleCount
    );
    fingerprintSampleIdToControlNameMap[
      controlFingerprintDownloaded.generatedSampleId
    ] = controlFingerprintDownloaded;
    sampleCount++;
  }

  return fingerprintSampleIdToControlNameMap;
}
