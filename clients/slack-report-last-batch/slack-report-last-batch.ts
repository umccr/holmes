import { WebClient } from "@slack/web-api";
import {
  _Object,
  ListObjectsCommand,
  ListObjectsV2Command,
  ListObjectsV2Output,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  DescribeExecutionCommand,
  SFNClient,
  StartExecutionCommand,
} from "@aws-sdk/client-sfn";
import {
  DiscoverInstancesCommand,
  ServiceDiscoveryClient,
} from "@aws-sdk/client-servicediscovery";
import { format, isSameDay, max } from "date-fns";
import pLimit from "p-limit";
import { basename } from "path";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

const s3Client = new S3Client({});
const cloudMapClient = new ServiceDiscoveryClient({});
const secretsClient = new SecretsManagerClient({});

if (process.argv.length < 3) {
  console.log("Need to pass in bucket");
  process.exit(1);
}

const bucketName = process.argv[2];

console.log(`Looking for newest fingerprints in ${bucketName}`);

const sitesChecksum = "ad0e523b19164b9af4dda86c90462f6a"; // pragma: allowlist secret
const stepsConcurrent = 10;
const relatedness = 0.4;
// const slackChannel = "#biobots";
const slackChannel = "U029NVAK56W"; // PATTO channel

/**
 * A quick interface showing the structure of the results we
 * get back from a somalier check.
 */
interface SomalierFingerprint {
  file: string;
  n: number;
  relatedness: number;
  shared_hets: number;
  shared_hom_alts: number;
}

(async () => {
  // determine our access to the Slack app we want to report with
  const slackSecretsOutput = await secretsClient.send(
    new GetSecretValueCommand({
      SecretId: "SlackApps",
    })
  );

  if (!slackSecretsOutput.SecretString) {
    throw new Error(
      "Expected SlackApps secret to let us talk to the Slack app"
    );
  }

  const slackSecrets = JSON.parse(slackSecretsOutput.SecretString);

  const web = new WebClient(slackSecrets["HolmesBotUserOAuthToken"]);

  // service discover the steps bits of holmes
  const checkStepsArn = await findCheck();

  // find all the fingerprints present
  const allFingerprints = [];
  for await (const i of s3ListAllFingerprintFiles(bucketName, sitesChecksum))
    allFingerprints.push(i);

  // find the 'last' days fingerprints
  const lastDate = max(allFingerprints.map((c) => c.LastModified!));

  const urls: string[] = [];

  for (const c of allFingerprints) {
    if (isSameDay(c.LastModified!, lastDate)) {
      const buf = Buffer.from(
        c.Key!.substring(sitesChecksum.length + 1),
        "hex"
      );
      const url = buf.toString("utf8");

      // skip folder entries
      if (url.trim().length == 0) continue;

      // skip PTC and NTC for the moment
      if (url.includes("PTC_") || url.includes("NTC_")) {
        console.log(`Skipping sample ${url}`);
      } else {
        console.log(`Including sample ${url}`);
        urls.push(url);
      }
    }
  }

  console.log(`Found ${urls.length} URLs to test that occurred on ${lastDate}`);

  // do the fingerprinting and establish any groups
  const groups = await groupUrls(checkStepsArn, urls);

  // we have run the fingerprinting - now report back via slack
  let gCount = 1;

  try {
    await web.chat.postMessage({
      channel: slackChannel,
      text: `For sequencing runs that finished on ${format(lastDate, "PPPP")}`,
    });

    let newTxt = "*New Unrelated Samples*\n";
    for (const ni of groups.unmatchedIndividuals.sort() || []) {
      newTxt = newTxt + `\`${ni}\`\n`;
    }

    await web.chat.postMessage({
      channel: slackChannel,
      text: newTxt,
    });

    for (const g of groups.matchGroups) {
      let newTxt = `*Match Group ${gCount++}*\n`;
      for (const [k, v] of g.entries()) {
        newTxt =
          newTxt +
          `\`${k}\` r=${v.relatedness} n=${v.n} shared hets=${v.shared_hets} shared hom alts=${v.shared_hom_alts}\n`;
      }

      await web.chat.postMessage({
        channel: slackChannel,
        text: newTxt,
      });
    }
  } catch (error) {
    console.log(error);
  }
})();

/**
 * Do a service discovery to find where the Holmes steps functions live
 */
async function findCheck() {
  const holmes = await cloudMapClient.send(
    new DiscoverInstancesCommand({
      NamespaceName: "umccr",
      ServiceName: "fingerprint",
    })
  );

  if (!holmes.Instances || holmes.Instances.length < 1)
    throw new Error("Found no holmes instance in our namespace");

  if (
    !holmes.Instances[0].Attributes ||
    !("checkStepsArn" in holmes.Instances[0].Attributes)
  )
    throw new Error(
      "Holmes cloudmap instance did not have a check steps arn for us to invoke"
    );

  return holmes.Instances[0].Attributes!["checkStepsArn"]!;
}

/**
 * Given a list of BAM Urls (generally from a single sequencing run batch) - this will check
 * them each against the existing pool of BAMs and group them semantically.
 *
 * @param checkStepsArn
 * @param urls
 */
async function groupUrls(checkStepsArn: string, urls: string[]) {
  const unmatchedIndividuals: string[] = [];
  const matchResults: any[][] = [];

  // we are having some 'too many lambda executions' problems - we should fix this in the steps functions
  // themselves (especially those with huge fanouts - should handle with some retries)
  // but for the moment we limit the concurrency here
  const limit = pLimit(stepsConcurrent);

  await Promise.all(
    urls.map((url) =>
      limit(doStepsExecution, new SFNClient({}), checkStepsArn, {
        index: url,
        relatednessThreshold: relatedness,
        // our regex runs on the *encoded* urls - which means NTC_ and PTC converted to hex.. (this should probably be fixed)
        excludeRegex: ".*(5054435f|4e54435f).*",
      })
        .then((fingerprintCheckResult: SomalierFingerprint[]) => {
          // if only a single entry in the result - then we matched only with ourselves.. we are new individuals
          if (fingerprintCheckResult.length === 0) {
            // this shouldn't happen but if it does we shouldn't fail
          } else if (
            fingerprintCheckResult.length === 1 &&
            fingerprintCheckResult[0].file === url
          )
            unmatchedIndividuals.push(url);
          else {
            // we were a group of related fingerprints - we need to process further

            // if all the files have the same filename - then as per our pipelines they are already expected to be the same person
            // so no value in reporting
            const basePaths = new Set<string>();

            for (const f of fingerprintCheckResult) {
              basePaths.add(basename(f.file));
            }

            // try to find groups with the same SBJID
            const subjects = new Set<string>();

            for (const f of fingerprintCheckResult) {
              const subjectMatches = f.file.match(/.*(SBJ\d\d\d\d\d).*/);

              // if we DON'T match any subject - then we really kind of want to abort
              // and make sure the group is reported.. so we add the unique filename as
              // a subject id - which will cause the later logic to force the group report
              if (!subjectMatches || subjectMatches.length < 2)
                subjects.add(f.file);
              else subjects.add(subjectMatches[1]);
            }

            // TODO: is the SBJID such a stronger check that we really only want to do that one??
            // if we ended up with a group that had the same filenames - then these are basically the same
            // run and we expect them to be the same..
            // if we finished with something we believe internally to be the same subject - then no need to report

            if (subjects.size === 1 || basePaths.size === 1)
              unmatchedIndividuals.push(fingerprintCheckResult[0].file);
            else matchResults.push(fingerprintCheckResult);
          }
        })
        .catch((err: any) => {
          console.log(err);

          throw new Error(
            "One of the fingerprint step executions failed so we are failing the whole check - sometimes this is caused by too many Lambdas running (dial back stepsConcurrent?)"
          );
        })
    )
  );

  // match results is now an array or arrays - where the inner arrays are somalier fingerprint groups
  // HOWEVER - those groups are in some ways symmetric i.e. A->B comes back also as B->A
  // so we want to tidy up to get a useful slack message

  const matchGroups: Map<string, SomalierFingerprint>[] = [];

  while (matchResults.length > 0) {
    // we sort by those that match the most
    // and try to subset the others into that bigger group
    const sortedMatchResults = matchResults.sort((a, b) => b.length - a.length);

    // make a Set of the files involved in this 'biggest' group
    const nextGroupFileSet = new Set(sortedMatchResults[0].map((a) => a.file));

    // for every other group - see if we are a true subset - and if so delete
    for (let i = sortedMatchResults.length - 1; i >= 1; i--) {
      const potentialMerge = sortedMatchResults[i];
      const potentialMergeFileSet = new Set(potentialMerge.map((a) => a.file));

      if (isSuperset(nextGroupFileSet, potentialMergeFileSet)) {
        sortedMatchResults.splice(i, 1);
      }
    }

    // turn the big group into a result we can show
    matchGroups.push(
      new Map(
        sortedMatchResults[0].map((i) => [i.file, (({ file, ...o }) => o)(i)])
      )
    );

    // delete the biggest group from the array and go around again
    sortedMatchResults.splice(0, 1);
  }

  return {
    unmatchedIndividuals,
    matchGroups,
  };
}

function isSuperset(set: Set<string>, subset: Set<string>) {
  for (const elem of subset.values()) {
    if (!set.has(elem)) {
      return false;
    }
  }
  return true;
}

/**
 * Execute a steps function and wait for the result (via polling)
 *
 * @param stepsClient
 * @param stepsArn
 * @param inp
 */
async function doStepsExecution(
  stepsClient: SFNClient,
  stepsArn: string,
  inp: any
): Promise<any> {
  const stepExecuteResult = await stepsClient.send(
    new StartExecutionCommand({
      stateMachineArn: stepsArn,
      input: JSON.stringify(inp),
    })
  );

  if (!stepExecuteResult.executionArn) {
    console.log(stepExecuteResult);
    throw new Error("Step failed to execute");
  }

  let stepResult: any = {};

  while (true) {
    const execResult = await stepsClient.send(
      new DescribeExecutionCommand({
        executionArn: stepExecuteResult.executionArn,
      })
    );

    if (execResult.output) {
      stepResult = JSON.parse(execResult.output);
    }

    if (execResult.status == "ABORTED" || execResult.status == "FAILED")
      throw new Error("Unexpected failure status");

    if (execResult.status != "RUNNING") break;

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  return stepResult;
}

/**
 * List all the fingerprint files in a bucket for a given sites file (identified by
 * its checksum).
 *
 * @param bucketName
 * @param sitesChecksum
 */
export async function* s3ListAllFingerprintFiles(
  bucketName: string,
  sitesChecksum: string
): AsyncGenerator<_Object> {
  let contToken = undefined;

  do {
    const data: ListObjectsV2Output = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: sitesChecksum,
        ContinuationToken: contToken,
      })
    );

    contToken = data.NextContinuationToken;

    for (const file of data.Contents || []) yield file;
  } while (contToken);
}
