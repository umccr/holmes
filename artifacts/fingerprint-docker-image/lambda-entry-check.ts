import { fingerprintBucketName } from "./lib/env";
import { getSlackTextAttacher } from "./lib/slack";
import { reportList } from "./lib/report-list";
import { stepsDoExecution } from "./lib/aws";
import { SFNClient } from "@aws-sdk/client-sfn";
import { distributedMapManifestToLambdaResults } from "./lib/distributed-map";
import { lambdaResultsToGraph } from "./lib/graph";
import { alg, Graph } from "@dagrejs/graphlib";

type EventInput = {
  // the BAM urls to use as indexes in our check against the database
  indexes: string[];

  // the slash terminated folder where the fingerprints have been sourced in S3 (i.e. the folder key + /)
  fingerprintFolder: string;

  relatednessThreshold?: number;

  expectRelatedRegex?: string;

  // if present, tells the lambda to send the response as an attachment to Slack in that channel
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

  const stepsArgs = {
    fingerprintFolder: ev.fingerprintFolder,
    indexes: ev.indexes,
    relatednessThreshold: ev.relatednessThreshold,
    expectRelatedRegex: ev.expectRelatedRegex,
  };

  const fingerprintCheckResult = await stepsDoExecution(
    new SFNClient({}),
    process.env["CHECK_STEPS_ARN"],
    stepsArgs
  );

  // an example check large result (note we have suppressed some values out i.e. <runuuid>)
  // {
  //   "expectRelatedRegex": "^\\b$",
  //   "excludeRegex": "^\\b$",
  //   "minimumNCount": 50,
  //   "indexes": [
  //     "gds://1kg-genomes/extra/HG00100.bam",
  //     "gds://1kg-genomes/extra/HG00101.bam",
  //     "gds://1kg-genomes/extra/HG00103.bam"
  //   ],
  //   "relatednessThreshold": -0.5,
  //   "fingerprintFolder": "fingerprints-1kg/",
  //   "matches": {
  //     "MapRunArn": "arn:aws:states:<region>:<account>:mapRun:SomalierCheckLargeStateMachine03C80DDB-ABCD/<stepsuuid>:<runuuid>",
  //     "ResultWriterDetails": {
  //       "Bucket": "umccr-fingerprint-local-dev-test",
  //       "Key": "temp/<runuuid>/manifest.json"
  //     }
  //   }
  // }

  // all the details of the result are saved into the files - AS LISTED IN THE GIVEN MANIFEST
  // so firstly we turn all that data into a JSON array
  const lambdaResults = await distributedMapManifestToLambdaResults(
    fingerprintCheckResult.matches.ResultWriterDetails.Bucket,
    fingerprintCheckResult.matches.ResultWriterDetails.Key
  );

  const { relatedGraph, missingRelatedGraph, indexOnlyRelatedGraph } =
    await lambdaResultsToGraph(lambdaResults);

  //const reports = reportRelated(
  //    relatedGraph,
  //    indexOnlyRelatedGraph.nodes().sort()
  //);

  const urls: string[] = [];

  if (ev.channelId) {
    const responder = await getSlackTextAttacher(ev.channelId);

    const report = JSON.stringify(alg.components(relatedGraph), null, 2);

    await responder(report);
  }

  return urls;
};
