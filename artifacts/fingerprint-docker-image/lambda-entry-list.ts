import { fingerprintBucketName } from "./lib/env";
import { getSlackResponder, getSlackTextAttacher } from "./lib/slack";
import { reportList } from "./lib/report-list";
import { urlListByRegex } from "./lib/url-list-by-regex";

type EventInput = {
  // the URL of the BAMs we are asking for an all pairs report
  indexes: string[];

  // the regexes to apply to the fingerprints (ANY of the regexes need to match)
  regexes: string[];

  // the slash terminated folder where the fingerprints have been sourced in S3 (i.e. the folder key + /)
  fingerprintFolder: string;

  excludeRegex?: string;

  // if present, tells the lambda to send the response as an attachment to Slack in that channel
  channelId?: string;
};

/**
 * A lambda which lists URLS and dates of fingerprints that match the regexes passed in.
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
  console.log(`Indexes = ${ev.indexes}`);

  const urls = await urlListByRegex(
    ev.regexes,
    ev.indexes,
    ev.fingerprintFolder,
    ev.excludeRegex
  );

  const reportTitle = `Fingerprint list report for regexes【${ev.regexes!.join(
    " | "
  )}】 and ${(ev.indexes || []).length} explicit indexes`;

  if (urls.length === 0) {
    if (ev.channelId) {
      const responder = await getSlackTextAttacher(ev.channelId);

      await responder("⚠️ NO FINGERPRINTS FOUND", reportTitle);
    }

    return [];
  }

  if (ev.channelId) {
    const responder = await getSlackTextAttacher(ev.channelId);
    const report = await reportList(urls);
    await responder(report, reportTitle);
  }

  return urls;
};
