import { fingerprintBucketName } from "./lib/environment-constants";
import { getSlackResponder, getSlackTextAttacher } from "./lib/slack";
import { reportList } from "./lib/report-list";
import { urlListByRegex } from "./lib/url-list-by-regex";

type EventInput = {
  // for list indexes and regexes can both be specified together

  // the BAM urls to use as indexes
  indexes: string[];

  // AND a set of BAM url regexes ANY of which matching will include the BAM in the index
  regexes: string[];

  // the slash terminated folder where the fingerprints have been sourced in S3 (i.e. the folder key + /)
  fingerprintFolder: string;

  // if present, a regular expression to apply to all filenames to exclude them from use as indexes entirely
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
