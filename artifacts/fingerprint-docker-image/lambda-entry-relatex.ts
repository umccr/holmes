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

type EventInput = {
  // a list of regexs (ANY match) on URLs that will go to build the indexes for the all pairs report
  regexes: string[];

  // the slash terminated folder where the fingerprints have been sourced in S3 (i.e. the folder key + /)
  fingerprintFolder: string;

  // if present, tells the lambda to send the response as an attachment to Slack in that channel
  channelId?: string;
};

/**
 * A lambda which does an all pairs somalier report (i.e somalier relate)
 * on a regex of BAMs.
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

  const indexes = await urlListByRegex(ev.regexes, ev.fingerprintFolder);

  const MAX_ALL_PAIRS = 25;

  if (indexes.length > MAX_ALL_PAIRS) {
    if (ev.channelId) {
      const responder = await getSlackTextAttacher(ev.channelId);
      await responder(
        `The maximum number of samples that can
be processed for this report is ${MAX_ALL_PAIRS}
but your regex has matched ${indexes.length}`
      );
    }

    return {
      errorMessage: `Your regex matched ${indexes.length} samples which is above the maximum of ${MAX_ALL_PAIRS} allowed`,
      samplesTsv: "",
      pairsTsv: "",
    };
  }

  const indexSampleIdToBamUrlMap = await downloadIndexSamples(
    indexes.map((i) => i.url),
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
    const report = await reportRelate(fixedSamplesTsv, fixedPairsTsv);
    await responder(
      report,
      `Fingerprint relatex report for ${ev.regexes.join(" | ")}`
    );
  }

  return {
    samplesTsv: fixedSamplesTsv,
    pairsTsv: fixedPairsTsv,
  };
};
