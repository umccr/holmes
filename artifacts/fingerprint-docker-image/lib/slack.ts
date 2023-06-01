import { IncomingWebhook } from "@slack/webhook";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { WebClient } from "@slack/web-api";

/**
 * Get the Slack web client for our app.
 */
export async function getSlackWebClient() {
  const val = await getSlackSecret(
    "Holmes",
    "BotUserOAuthToken",
    "OAuth client"
  ); // pragma: allowlist secret

  return new WebClient(val);
}

/**
 * Get the signing secret used for validating Slack commands.
 */
export async function getSlackSigningSecret(): Promise<string> {
  return await getSlackSecret("Holmes", "SigningSecret", "signing secret"); // pragma: allowlist secret
}

/**
 * Get an action that can abstract the way we respond to Slack.
 *
 * @param slackResponseUrl
 */
export async function getSlackResponder(slackResponseUrl: string) {
  const webhook = new IncomingWebhook(slackResponseUrl);

  return async (slackMessage: any) => {
    return await webhook.send(slackMessage);
  };
}

/**
 * Return a function that can be used to upload text file content to a Slack channel.
 * This is the only way we could find to get decent sized (more than a few lines) / fixed width font content displayed
 * in slack messages.
 *
 * @param slackChannel
 */
export async function getSlackTextAttacher(slackChannel: string) {
  const web = await getSlackWebClient();

  return async (slackTextMessage: string, title?: string) => {
    return await web.files.upload({
      channels: slackChannel,
      content: slackTextMessage,
      filetype: "text",
      title: title,
    });
  };
}

/**
 * Return from our secret the given field for the given named Slack app.
 *
 * @param appName the app name as in the secret JSON (does not necessarily have to match the slack app name)
 * @param fieldName a field in the secret
 * @param fieldDescription a description of the field for error messages
 */
async function getSlackSecret(
  appName: string,
  fieldName: string,
  fieldDescription: string
) {
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

  if (!(appName in slackSecrets))
    throw new Error(
      `There needs to be a 'SlackApps' Secret with key ${appName} with fields in it representing settings for the Slack app`
    );

  const appSlackSecrets = slackSecrets[appName];

  if (!(fieldName in appSlackSecrets))
    throw new Error(
      `There needs to be a 'SlackApps' Secret with field ${fieldName} with the ${fieldDescription}`
    );

  return appSlackSecrets[fieldName];
}
