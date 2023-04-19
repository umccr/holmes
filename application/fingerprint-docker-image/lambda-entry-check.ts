import { chdir } from "process";
import { URL } from "url";
import { somalierWork } from "./lib/env";
import { keyToUrl, urlToKey } from "./lib/aws";
import {
  cleanSomalierFiles,
  downloadAndCorrectFingerprint,
  extractMatchesAgainstIndexes,
  runSomalierRelate,
} from "./lib/somalier";
import { EitherMatchOrNoMatchType } from "./lib/somalier-types";

/* Example input as processed through the Step Functions Distributed Map batcher

{
    "BatchInput": {
        "indexes": ["gds://development/FAKE00001/NTC.bam"],
        "fingerprintFolder": "fingerprints/",
        "relatednessThreshold": 0.4
    },
    "Items": [
        {
            "Etag": "\"e9cfb6278ca06b24ba23de07a074996f\"",
            "Key": "fingerprints/6764733a2f2f646576656c6f706d656e742f4f5448455246414b4530303030342f5054432e62616d",
            "LastModified": 1671425036,
            "Size": 207211,
            "StorageClass": "STANDARD"
        },
        {
            "Etag": "\"e9cfb6278ca06b24ba23de07a074996f\"",
            "Key": "fingerprints/6764733a2f2f646576656c6f706d656e742f4f5448455246414b4530303030352f5054432e62616d",
            "LastModified": 1671425036,
            "Size": 207211,
            "StorageClass": "STANDARD"
        }
    ]
}
 */

type EventInput = {
  BatchInput: {
    // the URL of the BAMs we are checking against all others
    indexes: string[];

    // the slash terminated folder where the fingerprints have been sourced in S3 (i.e. the folder key + /)
    fingerprintFolder: string;

    // the relatedness threshold to report against
    relatednessThreshold: number;

    // a minimum N count that we need to meet to report against
    minimumNCount: number;

    // if present a regex that is matched to BAM filenames (i.e. not against the hex encoded keys)
    // and tells us to exclude them from sending to "somalier relate"
    excludeRegex?: string;

    // if present a regex that generates match groups - and expects all fingerprints with group matches
    // to the index - to also be 'related' genomically.. this is used to detect fingerprints that *should*
    // be related but come back not related
    expectRelatedRegex?: string;
  };

  // a set of fingerprint URLs which we will check the index against
  Items: {
    Key: string;
    LastModified: number;
    Size: number;
  }[];
};

/**
 * A lambda which does the main work of comparing fingerprint files
 * using the somalier command line tool.
 *
 * It is passed an index fingerprint file and compares it to a small subset of
 * other fingerprint files (all in a fingerprint bucket in S3).
 *
 * There are file naming conventions on the fingerprint files which allow us
 * to work out what source BAMs created them - though we do not deal with
 * any of that logic here.
 *
 * The underlying assumption is that all fingerprint files exactly match
 * on corresponding sites.yaml file that was used to create them - but again
 * that logic is not dealt with here.
 *
 * @param ev
 * @param context
 */
export const lambdaHandler = async (ev: EventInput, context: any) => {
  if (!ev.BatchInput.relatednessThreshold)
    throw new Error("No relatednessThreshold specified in lambda input");

  if (
    !ev.BatchInput.fingerprintFolder ||
    !ev.BatchInput.fingerprintFolder.endsWith("/")
  )
    throw new Error(
      "No fingerprintFolder (with slash suffix) specified in lambda input"
    );

  console.log(`Fingerprint folder = ${ev.BatchInput.fingerprintFolder}`);
  console.log(`Relatedness threshold = ${ev.BatchInput.relatednessThreshold}`);
  console.log(`Exclude regex = ${ev.BatchInput.excludeRegex}`);
  console.log(`Expect related regex = ${ev.BatchInput.expectRelatedRegex}`);
  // console.log(indexes).. these will be printed as part of the debug for the somalier invoke

  // only small areas of the lambda runtime are read/write so we need to make sure we are in a writeable working dir
  chdir(somalierWork);

  // as we download all the samples into this lambda context we assign them pseudo identifiers (of this count)
  let sampleCount = 0;

  // download all the 'index' samples that we want to compare against everything else
  const indexSampleIdToFingerprintKeyMap: { [sid: string]: string } = {};

  for (const indexUrl of ev.BatchInput.indexes) {
    // (NOTE: unlike the fingerprints - these all comes in as a URL BAM file location)
    const indexAsKey = urlToKey(
      ev.BatchInput.fingerprintFolder,
      new URL(indexUrl)
    );

    const newIndexSampleId = await downloadAndCorrectFingerprint(
      indexAsKey,
      sampleCount
    );
    indexSampleIdToFingerprintKeyMap[newIndexSampleId] = indexAsKey;
    sampleCount++;
  }

  // log the exact details of our index samples and sample id map
  console.log(JSON.stringify(indexSampleIdToFingerprintKeyMap, null, 2));

  // download and 'fix' the sample ids for all the other fingerprint files we have been passed
  const sampleIdToFingerprintKeyMap: { [sid: string]: string } = {};
  const fingerprintsAsUrlStrings: string[] = [];

  for (const fingerprintItem of ev.Items) {
    const fingerprintAsKey = fingerprintItem.Key;

    // distributed map s3 source includes 'folders' as entries
    if (fingerprintAsKey.endsWith("/")) continue;

    // we want the original fingerprint file url (i.e. gds://mysource/file.bam) so we can do regex against it
    const fingerprintAsUrl = keyToUrl(
      ev.BatchInput.fingerprintFolder,
      fingerprintItem.Key
    );

    if (ev.BatchInput.excludeRegex) {
      if (RegExp(ev.BatchInput.excludeRegex).test(fingerprintAsUrl.toString()))
        continue;
    }

    // useful to have all the fingerprint urls for some later logic
    fingerprintsAsUrlStrings.push(fingerprintAsUrl.toString());

    // build a map to help us correlate sample ids and fingerprint files
    const newSampleId = await downloadAndCorrectFingerprint(
      fingerprintAsKey,
      sampleCount
    );
    sampleIdToFingerprintKeyMap[newSampleId] = fingerprintAsKey;
    sampleCount++;
  }

  // log the exact details of our database fingerprints and sample id map
  console.log(JSON.stringify(sampleIdToFingerprintKeyMap, null, 2));

  if (sampleCount > 1) {
    await runSomalierRelate();

    const matches = await extractMatchesAgainstIndexes(
      ev.BatchInput.fingerprintFolder,
      indexSampleIdToFingerprintKeyMap,
      sampleIdToFingerprintKeyMap,
      ev.BatchInput.relatednessThreshold,
      ev.BatchInput.minimumNCount,
      ev.BatchInput.expectRelatedRegex
    );

    await cleanSomalierFiles();

    return matches;
  } else {
    // if due to our exclude regex or bad luck - we ended up with a batch that has no useable
    // fingerprints - then we just return all the index names but without actually running somalier
    // (we don't want to tempt fate with somalier runs of size 0 or 1)

    await cleanSomalierFiles();

    const matches: { [url: string]: EitherMatchOrNoMatchType[] } = {};

    for (const indexUrl of ev.BatchInput.indexes) {
      matches[indexUrl] = [];
    }

    return matches;
  }
};
