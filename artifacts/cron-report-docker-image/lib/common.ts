import { WebClient } from "@slack/web-api";
import {
  DiscoverInstancesCommand,
  ServiceDiscoveryClient,
} from "@aws-sdk/client-servicediscovery";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

export function bucketKeyToUrl(fingerprintFolder: string, key: string) {
  if (!fingerprintFolder.endsWith("/"))
    throw new Error("Fingerprint folders need to end with a slash");

  const buf = Buffer.from(key.substring(fingerprintFolder.length), "hex");
  return buf.toString("utf8");
}

async function getSlackSecret(fieldName: string, fieldDescription: string) {
  const secretsClient = new SecretsManagerClient({});

  // determine our access to the Slack app we want to report with
  const slackSecretsOutput = await secretsClient.send(
    new GetSecretValueCommand({
      SecretId: "SlackApps",
    })
  );

  if (!slackSecretsOutput.SecretString) {
    throw new Error(
      "There needs to be a 'SlackApps' Secret with secrets for all our Slack apps"
    );
  }
  const slackSecrets = JSON.parse(slackSecretsOutput.SecretString);

  if (!(fieldName in slackSecrets))
    throw new Error(
      `There needs to be a 'SlackApps' Secret with field ${fieldName} with the ${fieldDescription}`
    );

  return slackSecrets[fieldName];
}

/**
 * Get the Slack web client for our app.
 */
export async function getSlackWebClient() {
  const val = await getSlackSecret("HolmesBotUserOAuthToken", "OAuth client"); // pragma: allowlist secret

  return new WebClient(val);
}

export async function getSlackSigningSecret(): Promise<string> {
  return await getSlackSecret("HolmesSigningSecret", "signing secret");
}

/**
 * Do a service discovery to find where the Holmes steps functions live. Return
 * the ARN of the check Steps function.
 */
export async function findCheck() {
  const cloudMapClient = new ServiceDiscoveryClient({});

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
 * Do a service discovery to find where the Holmes steps functions live. Return
 * the ARN of the check Steps function.
 */
export async function findCheckLarge() {
  const cloudMapClient = new ServiceDiscoveryClient({});

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

  return holmes.Instances[0].Attributes!["checkLargeStepsArn"]!;
}

/**
 * Find the subject id from a file - assuming the standard UMCCR file naming conventions.
 *
 * @param url
 */
export function extractSubjectId(url: string): string | undefined {
  const subjectMatches = url.match(/.*(SBJ\d\d\d\d\d).*/);

  // if we DON'T match a single subject then we return null and let the caller deal
  if (!subjectMatches || subjectMatches.length < 2) return undefined;
  else return subjectMatches[1];
}

/**
 * Find the library id from a file - assuming the standard UMCCR file naming conventions.
 *
 * @param url
 */
export function extractLibraryId(url: string): string | undefined {
  const libraryMatches = url.match(/.*(L\d\d\d\d\d\d\d).*/);

  // if we DON'T match a single library then we return null and let the caller deal
  if (!libraryMatches || libraryMatches.length < 2) return undefined;
  else return libraryMatches[1];
}

// another piece of functionality - read a set of URIs from a file and print every one that doesn't exist
// as a fingerprint - then do a report on them all
/*if (false) {
  const wantedSet = new Set<string>();

  try {
    const rl = readline.createInterface({
      input: fs.createReadStream("holmes_request.txt"),
      crlfDelay: Infinity,
    });

    rl.on("line", (line) => {
      wantedSet.add(line.trim());
    });

    await events.once(rl, "close");
  } catch (err) {
    console.error(err);
  }

  const fingerprintSet = new Set<string>();

  for (const c of allFingerprints) {
    fingerprintSet.add(bucketKeyToUrl(c.Key!));
  }

  for (const w of wantedSet) {
    if (!fingerprintSet.has(w)) console.log(`\t\t"${w}",`);
    else urls.push(w);
  }
}*/
