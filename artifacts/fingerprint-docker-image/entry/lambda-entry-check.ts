import { fingerprintBucketName } from "../lib/environment-constants";
import { getSlackTextAttacher } from "../lib/slack";
import { stepsDoExecution } from "../lib/aws-misc";
import { SFNClient } from "@aws-sdk/client-sfn";
import { distributedMapManifestToLambdaResults } from "../lib/distributed-map";
import { reportCheck } from "../lib/report-check";
import { fingerprintListByRegex } from "../lib/fingerprint-list-by-regex";
import { MAX_CHECK } from "../limits";
import { S3Fingerprint } from "../lib/s3-fingerprint-db/s3-fingerprint";

type EventInput = {
  // EITHER the BAM urls to use as indexes
  indexes?: string[];
  // OR a set of BAM url regexes ANY of which matching will include the BAM in the index
  regexes?: string[];

  // the slash terminated folder where the fingerprints have been sourced in S3 (i.e. the folder key + /)
  fingerprintFolder: string;

  // if present, a regular expression to apply to all filenames to exclude them from use as indexes entirely
  excludeRegex?: string;

  // if present, a threshold of relatedness for somalier, or use a default
  relatednessThreshold?: number;

  // if present, impose a minimum N in somalier to be considered a positive "relation" between samples
  minimumNCount?: number;

  // if present, tells the lambda to additionally send the response as an attachment to Slack in that channel
  channelId?: string;
};

/**
 * A lambda which checks a set of index URLs against the fingerprint database.
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

  if (!process.env["CHECK_STEPS_ARN"])
    throw new Error(
      "The check steps machine ARN must be specified via environment variable"
    );

  console.log(`Finger bucket = ${fingerprintBucketName}`);
  console.log(`Folder = ${ev.fingerprintFolder}`);
  console.log(`Indexes = ${ev.indexes}`);
  console.log(`Regexes = ${ev.regexes}`);

  if (ev.regexes && ev.indexes)
    throw new Error(
      "Only one of indexes or regexes can be specified on any one check call"
    );

  let fingerprintsToCheck: S3Fingerprint[] = [];
  let truncated = false;

  if (ev.regexes) {
    fingerprintsToCheck = await fingerprintListByRegex(
      ev.regexes,
      [],
      ev.fingerprintFolder,
      ev.excludeRegex
    );
  } else if (ev.indexes) {
    fingerprintsToCheck = await fingerprintListByRegex(
      [],
      ev.indexes,
      ev.fingerprintFolder,
      ev.excludeRegex
    );
  } else
    throw new Error(
      "One of indexes or regexes must be specified on any one check call"
    );

  if (fingerprintsToCheck.length > MAX_CHECK) {
    fingerprintsToCheck = fingerprintsToCheck.slice(0, MAX_CHECK);
    truncated = true;
  }

  const reportTitle = ev.indexes
    ? `Fingerprint check report for explicit indexes ${
        truncated ? " (truncated)" : ""
      }`
    : `Fingerprint check report for regexes【${ev.regexes!.join(" | ")}】${
        truncated ? " (truncated)" : ""
      }`;

  if (fingerprintsToCheck.length === 0) {
    if (ev.channelId) {
      const responder = await getSlackTextAttacher(ev.channelId);

      await responder("⚠️ NO FINGERPRINTS FOUND", reportTitle);
    }

    return {};
  }

  const stepsArgs = {
    fingerprintFolder: ev.fingerprintFolder,
    indexes: fingerprintsToCheck.map((f) => f.url.toString()),
    relatednessThreshold: ev.relatednessThreshold,
    minimumNCount: ev.minimumNCount,
    excludeRegex: ev.excludeRegex,
  };

  const fingerprintCheckResult = await stepsDoExecution(
    new SFNClient({}),
    process.env["CHECK_STEPS_ARN"],
    stepsArgs
  );

  // all the details of the result are saved into the files - AS LISTED IN THE GIVEN MANIFEST
  // so firstly we turn all that data into a JSON array
  const lambdaResults = await distributedMapManifestToLambdaResults(
    fingerprintCheckResult.matches.ResultWriterDetails.Bucket,
    fingerprintCheckResult.matches.ResultWriterDetails.Key
  );

  if (ev.channelId) {
    const responder = await getSlackTextAttacher(ev.channelId);

    const report =
      (await reportCheck(lambdaResults)) +
      (truncated
        ? `\n⚠️ TOO MANY FINGERPRINT INPUTS SO CHECK WAS RUN ONLY ON FIRST ${MAX_CHECK}`
        : "");

    await responder(report, reportTitle);
  }

  return lambdaResults;
};
