import { fingerprintBucketName } from "./lib/env";
import { getSlackResponder, getSlackTextAttacher } from "./lib/slack";
import { reportList } from "./lib/report-list";
import { urlListByRegex } from "./lib/url-list-by-regex";

type EventInput = {
  // the regexes to apply to the fingerprints (ANY of the regexes need to match)
  regexes: string[];

  // the slash terminated folder where the fingerprints have been sourced in S3 (i.e. the folder key + /)
  fingerprintFolder: string;

  // if present, tells the lambda to send the response as an attachment to Slack in that channel
  channelId?: string;
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

  if (!fingerprintBucketName)
    throw new Error(
      "The fingerprint bucket name needs to be defined via environment variable"
    );

  console.log(`Finger bucket = ${fingerprintBucketName}`);
  console.log(`Folder = ${ev.fingerprintFolder}`);
  console.log(`Regexps = ${ev.regexes}`);

  const urls = await urlListByRegex(ev.regexes, ev.fingerprintFolder);

  if (ev.channelId) {
    const responder = await getSlackTextAttacher(ev.channelId);
    const report = await reportList(urls);
    await responder(report);
  }

  return urls;
};
