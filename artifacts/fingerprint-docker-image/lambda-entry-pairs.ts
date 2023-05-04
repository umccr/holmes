import { chdir } from "process";
import { URL } from "url";
import { somalierWork } from "./lib/env";
import { urlToKey } from "./lib/aws";
import {
  cleanSomalierFiles,
  downloadAndCorrectFingerprint,
  extractAllPairs,
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
  // we start with sample 1 as it makes our string replace later on less brittle..
  let sampleCount = 1;

  // download all the 'index' samples that we want to compare against everything else
  const indexSampleIdToFingerprintKeyMap: { [sid: string]: string } = {};
  const indexSampleIdToBamUrl: { [sid: string]: string } = {};

  for (const indexUrl of ev.indexes) {
    const indexAsKey = urlToKey(ev.fingerprintFolder, new URL(indexUrl));

    const newIndexSampleId = await downloadAndCorrectFingerprint(
      indexAsKey,
      sampleCount
    );
    indexSampleIdToFingerprintKeyMap[newIndexSampleId] = indexAsKey;
    indexSampleIdToBamUrl[newIndexSampleId] = indexUrl;
    sampleCount++;
  }

  await runSomalierRelate();

  let pairs = await extractAllPairs(
    ev.fingerprintFolder,
    indexSampleIdToFingerprintKeyMap
  );

  await cleanSomalierFiles();

  let allEntries = Object.entries(indexSampleIdToBamUrl);

  allEntries = allEntries.sort((a, b) => b.length - a.length);

  console.log(allEntries);

  // now we search/replace in the HTML report - for our sample ids and replace with BAM urls
  // NOTE: I guess there is a danger that this replaces a "real" occurrence of something
  // like 00004 in the Javascript.. but we'll take that chance (as other than the sample ids and
  // relatedness values - the rest of the Javascript is static and *doesn't* have long numbers with leading zeros!)
  for (const [sid, url] of allEntries) {
    pairs = pairs.replaceAll(sid, url);
  }

  // try to fix the width of the samples dropdown.. I mean this is very brittle - but is just a "best effort" fix
  // anyhow
  pairs = pairs.replace('style="width:300px"', 'style="width:800px"');

  return {
    // key: indexSampleIdToBamUrl,
    html: pairs,
  };
};
