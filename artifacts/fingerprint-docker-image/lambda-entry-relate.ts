import { chdir } from "process";
import { somalierWork } from "./lib/env";
import {
  cleanSomalierFiles,
  runSomalierRelate,
} from "./lib/somalier-download-run-clean";
import { somalierTsvCorrectIds } from "./lib/somalier-tsv-correct-ids";
import { getSlackTextAttacher } from "./lib/slack";
import { reportRelate } from "./lib/report-relate";
import { downloadIndexSamples } from "./lib/ids";
import { urlListByRegex } from "./lib/url-list-by-regex";
import { MAX_RELATE } from "./limits";

type EventInput = {
  // the URL of the BAMs we are asking for an all pairs report
  indexes: string[];

  // a set of BAM url regexes ANY of which need to match to be considered for all pairs report
  regexes?: string[];

  // the slash terminated folder where the fingerprints have been sourced in S3 (i.e. the folder key + /)
  fingerprintFolder: string;

  // if present, tells the lambda to send the response as an attachment to Slack in that channel
  channelId?: string;
};

/**
 * A lambda which does an all pairs somalier report (i.e somalier relate) on all BAM urls passed in
 * and returns the somalier result files as TSV.
 *
 * @param ev
 * @param _context
 */
export const lambdaHandler = async (ev: EventInput, _context: any) => {
  if (!ev.fingerprintFolder || !ev.fingerprintFolder.endsWith("/"))
    throw new Error(
      "No fingerprintFolder (with slash suffix) specified in lambda input"
    );

  // only small areas of the lambda runtime are read/write so we need to make sure we are in a writeable working dir
  chdir(somalierWork);

  if (ev.regexes && ev.indexes)
    throw new Error(
      "Only one of indexes or regexes can be specified on any one relate call"
    );

  let urlsToCheck: string[] = [];
  let truncated = false;

  if (ev.regexes) {
    let urls = await urlListByRegex(ev.regexes, [], ev.fingerprintFolder);
    urlsToCheck = urls.map((u) => u.url);
  } else if (ev.indexes) {
    urlsToCheck = ev.indexes;
  } else
    throw new Error(
      "One of indexes or regexes must be specified on any one relate call"
    );

  if (urlsToCheck.length > MAX_RELATE) {
    urlsToCheck = urlsToCheck.slice(0, MAX_RELATE);
    truncated = true;
  }

  const indexSampleIdToBamUrlMap = await downloadIndexSamples(
    urlsToCheck,
    ev.fingerprintFolder
  );

  const { pairsTsv, samplesTsv } = await runSomalierRelate();

  const fixedSamplesTsv = await somalierTsvCorrectIds(
    indexSampleIdToBamUrlMap,
    samplesTsv,
    // column 0 in the samples is a familyid - which we do not use - so we ignore (even though it gets
    // set to the sample id in the absence of a family)
    [1]
  );

  const fixedPairsTsv = await somalierTsvCorrectIds(
    indexSampleIdToBamUrlMap,
    pairsTsv,
    [0, 1]
  );

  await cleanSomalierFiles();

  if (ev.channelId) {
    const responder = await getSlackTextAttacher(ev.channelId);

    const report =
      (await reportRelate(fixedSamplesTsv, fixedPairsTsv)) +
      (truncated
        ? `\n⚠️ TOO MANY FINGERPRINT INPUTS SO RELATE WAS RUN ONLY ON FIRST ${MAX_RELATE}`
        : "");

    const reportTitle = ev.indexes
      ? `Fingerprint relate report for explicit indexes ${
          truncated ? " (truncated)" : ""
        }`
      : `Fingerprint relate report for regexes【${ev.regexes!.join(" | ")}】${
          truncated ? " (truncated)" : ""
        }`;

    await responder(report, reportTitle);
  }

  return {
    samplesTsv: fixedSamplesTsv,
    pairsTsv: fixedPairsTsv,
  };
};
