import { chdir } from "process";
import { URL } from "url";
import { somalierWork } from "./lib/env";
import { urlToKey } from "./lib/aws";
import {
  cleanSomalierFiles,
  downloadAndCorrectFingerprint,
  runSomalierRelate,
} from "./lib/somalier";

type EventInput = {
  // the URL of the BAMs we are asking for an all pairs report
  indexes: string[];

  // the slash terminated folder where the fingerprints have been sourced in S3 (i.e. the folder key + /)
  fingerprintFolder: string;
};

/**
 * A lambda which does an all pairs somalier report on all BAM urls passed in.
 *
 * @param ev
 * @param context
 */
export const lambdaHandler = async (ev: EventInput, context: any) => {
  if (!ev.fingerprintFolder || !ev.fingerprintFolder.endsWith("/"))
    throw new Error(
      "No fingerprintFolder (with slash suffix) specified in lambda input"
    );

  // only small areas of the lambda runtime are read/write so we need to make sure we are in a writeable working dir
  chdir(somalierWork);

  // as we download all the samples into this lambda context we assign them pseudo identifiers (of this count)
  let sampleCount = 0;

  // download all the 'index' samples that we want to compare against everything else
  const indexSampleIdToFingerprintKeyMap: { [sid: string]: string } = {};

  for (const indexUrl of ev.indexes) {
    const indexAsKey = urlToKey(ev.fingerprintFolder, new URL(indexUrl));

    const newIndexSampleId = await downloadAndCorrectFingerprint(
      indexAsKey,
      sampleCount
    );
    indexSampleIdToFingerprintKeyMap[newIndexSampleId] = indexAsKey;
    sampleCount++;
  }

  await runSomalierRelate();

  const pairs = await extractAllPairs(
    ev.fingerprintFolder,
    indexSampleIdToFingerprintKeyMap
  );

  await cleanSomalierFiles();

  return pairs;
};
