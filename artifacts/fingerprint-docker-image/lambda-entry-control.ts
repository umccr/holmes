import { chdir } from "process";
import { somalierWork } from "./lib/env";
import {
  cleanSomalierFiles,
  runSomalierRelate,
} from "./lib/somalier-download-run-clean";
import { somalierTsvCorrectIds } from "./lib/somalier-tsv-correct-ids";
import { getSlackTextAttacher } from "./lib/slack";
import { reportRelate } from "./lib/report-relate";
import { downloadControlSamples, downloadIndexSamples } from "./lib/ids";
import { urlListByRegex } from "./lib/url-list-by-regex";
import { MAX_RELATE } from "./limits";
import { reportControl } from "./lib/report-control";

type EventInput = {
  // a BAM urls to use as index
  index: string;

  // the slash terminated folder where the fingerprints have been sourced in S3 (i.e. the folder key + /)
  fingerprintFolder: string;

  // if present, tells the lambda to send the response as an attachment to Slack in that channel
  channelId?: string;
};

/**
 * A lambda which does a somalier relate report of an index BAM against a set of
 * control samples.
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

  const reportTitle = `Fingerprint control report for index ${ev.index}`;

  console.log(JSON.stringify(ev, null, 2));

  const indexSampleIdToBamUrlMap = await downloadIndexSamples(
    [ev.index],
    ev.fingerprintFolder
  );

  console.log(indexSampleIdToBamUrlMap);

  const controlSampleIdToNameMap = await downloadControlSamples(
    ev.fingerprintFolder,
    100
  );

  const { pairsTsv, samplesTsv } = await runSomalierRelate();

  const combinedSampleIdToNameMap: Record<string, string> = {};

  for (const [k, v] of Object.entries(indexSampleIdToBamUrlMap))
    combinedSampleIdToNameMap[k] = v;
  for (const [k, v] of Object.entries(controlSampleIdToNameMap))
    combinedSampleIdToNameMap[k] = v;

  const fixedSamplesTsv = await somalierTsvCorrectIds(
    combinedSampleIdToNameMap,
    samplesTsv,
    // column 0 in the samples is a familyid - which we do not use - so we ignore (even though it gets
    // set to the sample id in the absence of a family)
    [1]
  );

  const fixedPairsTsv = await somalierTsvCorrectIds(
    combinedSampleIdToNameMap,
    pairsTsv,
    [0, 1]
  );

  await cleanSomalierFiles();

  if (ev.channelId) {
    const responder = await getSlackTextAttacher(ev.channelId);

    const report = await reportControl(
      ev.index,
      fixedSamplesTsv,
      fixedPairsTsv
    );

    await responder(report, reportTitle);
  }

  return {
    samplesTsv: fixedSamplesTsv,
    pairsTsv: fixedPairsTsv,
  };
};
