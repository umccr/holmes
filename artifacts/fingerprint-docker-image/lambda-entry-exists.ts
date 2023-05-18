import { URL } from "url";
import { s3Exists, urlToKey } from "./lib/aws";
import { fingerprintBucketName } from "./lib/env";
import { reportExists } from "./lib/report-exists";
import { getSlackResponder } from "./lib/slack";

type EventInput = {
  // the URL of the BAMs we are asking if they exist as fingerprints
  indexes: string[];

  // the slash terminated folder where the fingerprints have been sourced in S3 (i.e. the folder key + /)
  fingerprintFolder: string;

  // if present, tells the lambda to also send the response as formatted text to Slack
  slackResponseUrl?: string;
};

/**
 * A lambda which checks for the existence of fingerprints corresponding to the input
 * BAM urls.
 *
 * @param ev
 * @param _context
 */
export const lambdaHandler = async (ev: EventInput, _context: any) => {
  if (!ev.fingerprintFolder || !ev.fingerprintFolder.endsWith("/"))
    throw new Error(
      "No fingerprintFolder (with slash suffix) specified in lambda input"
    );

  const resultExists: { [url: string]: boolean } = {};

  for (const indexAsBamUrl of ev.indexes) {
    const key = urlToKey(ev.fingerprintFolder, new URL(indexAsBamUrl));

    resultExists[indexAsBamUrl] = await s3Exists(fingerprintBucketName, key);
  }

  if (ev.slackResponseUrl)
    await reportExists(
      await getSlackResponder(ev.slackResponseUrl),
      resultExists
    );

  return resultExists;
};
