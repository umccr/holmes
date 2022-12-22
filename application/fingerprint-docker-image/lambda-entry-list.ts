import { keyToUrl } from "./lib/aws";

/* Example input as processed through the Step Functions Distributed Map batcher

{
    "BatchInput": {
    },
    "Items": [
        {
            "Etag": "\"e9cfb6278ca06b24ba23de07a074996f\"",
            "Key": "fingerprints/6764733a2f2f646576656c6f706d656e742f4f5448455246414b4530303030342f5054432e62616d",
            "LastModified": 1671425036,
            "Size": 207211,
            "StorageClass": "STANDARD"
        },
        ....
    ]
}
 */

type EventInput = {
  BatchInput: {
    // the slash terminated folder where the fingerprints have been sourced in S3 (i.e. the folder key + /)
    fingerprintFolder: string;

    // a regex that is matched to BAM filenames for inclusion in the list (default to a regex for *all*)
    bamRegex: string;
  };

  // a set of fingerprint URLs which we will check the index against
  Items: {
    Key: string;
    LastModified: number;
    Size: number;
  }[];
};

/**
 * A lambda which outputs some details of fingerprints held in the db
 *
 * @param ev
 * @param context
 */
export const lambdaHandler = async (ev: EventInput, context: any) => {
  if (
    !ev.BatchInput.fingerprintFolder ||
    !ev.BatchInput.fingerprintFolder.endsWith("/")
  )
    throw new Error(
      "No fingerprintFolder (with slash suffix) specified in lambda input"
    );

  const results = [];

  for (const fingerprintItem of ev.Items) {
    const fingerprintAsKey = fingerprintItem.Key;

    // distributed map s3 source includes 'folders' as entries
    if (fingerprintAsKey.endsWith("/")) continue;

    // we want the original fingerprint file url (i.e. gds://mysource/file.bam) so we can do regex against it
    const fingerprintAsUrl = keyToUrl(
      ev.BatchInput.fingerprintFolder,
      fingerprintItem.Key
    );

    if (!RegExp(ev.BatchInput.bamRegex).test(fingerprintAsUrl.toString()))
      continue;

    results.push({
      bam: fingerprintAsUrl.toString(),
      fingerprintKey: fingerprintAsKey,
    });
  }

  return results;
};
