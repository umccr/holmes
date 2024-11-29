import { chdir } from "process";
import { URL } from "url";
import { somalierWork } from "../lib/environment-constants";
import { keyToUrl, urlToKey } from "../lib/aws-misc";
import {
  cleanSomalierFiles,
  runSomalierRelate,
} from "../lib/somalier-download-run-clean";
import { HolmesReturnType } from "../lib/somalier-types";
import { pairsAnalyse } from "../lib/somalier-pairs-analyse";
import {
  downloadAndCorrectFingerprint,
  FingerprintDownloaded,
} from "../lib/fingerprint-download";

/**
 * NOTE this is the guts of the actual fingerprint check
 * functionality. However, this is *only* launched via the Steps
 * DistributedMap functionality.
 *
 * The actual check function for use by users is in a different
 * lambda.
 */

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
 * It is passed index fingerprint URLs and compares them to a small subset of
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
  // console.log(indexes).. these will be printed as part of the debug for the somalier invoke

  // only small areas of the lambda runtime are read/write so we need to make sure we are in a writeable working dir
  chdir(somalierWork);

  // we can theoretically fail a somalier run - and therefore never clean up... and therefore fail
  // in the future with some extra files left over from a previous run...
  // I think I saw this in the wild once - well it was the only explanation... so adding
  // this here for safety
  await cleanSomalierFiles();

  // as we download all the samples into this lambda context we assign them pseudo identifiers (of this count)
  let sampleCount = 0;

  // download all the 'index' samples that we want to compare against everything else
  const indexSampleIdToFingerprintKeyMap: {
    [sid: string]: FingerprintDownloaded;
  } = {};

  for (const indexUrl of ev.BatchInput.indexes) {
    // (NOTE: unlike the fingerprints - these all comes in as a BAM URLs - we need to convert them to a fingerprint key)
    const indexAsKey = urlToKey(
      ev.BatchInput.fingerprintFolder,
      new URL(indexUrl)
    );

    const indexFingerprintDownloaded = await downloadAndCorrectFingerprint(
      ev.BatchInput.fingerprintFolder,
      indexAsKey,
      indexUrl,
      sampleCount
    );
    indexSampleIdToFingerprintKeyMap[
      indexFingerprintDownloaded.generatedSampleId
    ] = indexFingerprintDownloaded;
    sampleCount++;
  }

  // log the exact details of our index samples and sample id map
  console.log(JSON.stringify(indexSampleIdToFingerprintKeyMap, null, 2));

  // download and 'fix' the sample ids for all the other fingerprint files we have been passed
  const sampleIdToFingerprintKeyMap: { [sid: string]: FingerprintDownloaded } =
    {};

  for (const fingerprintItem of ev.Items) {
    const fingerprintAsKey = fingerprintItem.Key;

    // distributed map s3 source includes 'folders' as entries
    if (fingerprintAsKey.endsWith("/")) continue;

    // we want the original fingerprint file url (i.e. gds://mysource/file.bam) so we can do regex against it
    const fingerprintAsUrl = keyToUrl(
      ev.BatchInput.fingerprintFolder,
      fingerprintItem.Key
    );

    // we can exclude sample based on name
    if (ev.BatchInput.excludeRegex) {
      if (RegExp(ev.BatchInput.excludeRegex).test(fingerprintAsUrl.toString()))
        continue;
    }

    // build a map to help us correlate sample ids and fingerprint files
    const sampleFingerprintDownloaded = await downloadAndCorrectFingerprint(
      ev.BatchInput.fingerprintFolder,
      fingerprintAsKey,
      fingerprintItem.Key,
      sampleCount
    );
    sampleIdToFingerprintKeyMap[sampleFingerprintDownloaded.generatedSampleId] =
      sampleFingerprintDownloaded;
    sampleCount++;
  }

  // log the exact details of our database fingerprints and sample id map
  console.log(JSON.stringify(sampleIdToFingerprintKeyMap, null, 2));

  if (sampleCount > 1) {
    const { pairsTsv } = await runSomalierRelate();

    return await pairsAnalyse(
      pairsTsv,
      ev.BatchInput.fingerprintFolder,
      indexSampleIdToFingerprintKeyMap,
      sampleIdToFingerprintKeyMap,
      ev.BatchInput.relatednessThreshold,
      ev.BatchInput.minimumNCount
    );
  } else {
    // if due to our exclude regex or bad luck - we ended up with a batch that has no useable
    // fingerprints - then we just return all the index names but without actually running somalier
    // (we don't want to tempt fate with somalier runs of size 0 or 1)

    const matches: { [url: string]: HolmesReturnType[] } = {};

    for (const indexUrl of ev.BatchInput.indexes) {
      matches[indexUrl] = [];
    }

    return matches;
  }
};
