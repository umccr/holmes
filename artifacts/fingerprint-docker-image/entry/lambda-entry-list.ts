import { fingerprintBucketName } from "../lib/environment-constants";
import { getSlackResponder, getSlackTextAttacher } from "../lib/slack";
import { reportList } from "../lib/report-list";
import { fingerprintListByRegex } from "../lib/fingerprint-list-by-regex";

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

  const fingerprints = await fingerprintListByRegex(
    ev.regexes,
    ev.indexes,
    ev.fingerprintFolder,
    ev.excludeRegex
  );

  // if asked, report back to Slack
  if (ev.channelId) {
    const reportTitle = `Fingerprint list report for regexes【${ev.regexes!.join(
      " | "
    )}】 and ${(ev.indexes || []).length} explicit indexes`;

    if (fingerprints.length === 0) {
      const responder = await getSlackTextAttacher(ev.channelId);

      await responder("⚠️ NO FINGERPRINTS FOUND", reportTitle);
    } else {
      const responder = await getSlackTextAttacher(ev.channelId);
      const report = await reportList(fingerprints);
      await responder(report, reportTitle);
    }
  }

  return fingerprints;
};
