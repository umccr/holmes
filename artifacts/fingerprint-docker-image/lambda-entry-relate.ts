import { chdir } from "process";
import { URL } from "url";
import { somalierWork } from "./lib/env";
import { urlToKey } from "./lib/aws";
import {
  cleanSomalierFiles,
  downloadAndCorrectFingerprint,
  runSomalierRelate,
} from "./lib/somalier-download-run-clean";
import { somalierTsvCorrectIds } from "./lib/somalier-tsv-correct-ids";
import { reportExists } from "./lib/report-exists";
import {
  getSlackChanneller,
  getSlackResponder,
  getSlackTextAttacher,
} from "./lib/slack";
import { reportRelate } from "./lib/report-relate";
import { downloadIndexSamples } from "./lib/ids";

type EventInput = {
  // the URL of the BAMs we are asking for an all pairs report
  indexes: string[];

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

  const indexSampleIdToBamUrlMap = await downloadIndexSamples(
    ev.indexes,
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
    const report = reportRelate(fixedSamplesTsv, fixedPairsTsv);

    await responder(report);
  }

  return {
    samplesTsv: fixedSamplesTsv,
    pairsTsv: fixedPairsTsv,
  };
};
