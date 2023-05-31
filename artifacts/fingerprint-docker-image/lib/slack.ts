import { IncomingWebhook } from "@slack/webhook";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { WebClient } from "@slack/web-api";

export async function getSlackResponder(slackResponseUrl: string) {
  const webhook = new IncomingWebhook(slackResponseUrl);

  return async (slackMessage: any) => {
    return await webhook.send(slackMessage);
  };
}

export async function getSlackChanneller(slackChannel: string) {
  const web = await getSlackWebClient();

  return async (slackMessage: any) => {
    slackMessage["channel"] = slackChannel;

    return await web.chat.postMessage(slackMessage);
  };
}

/**
 * Return a function that can be used to upload text file content to a Slack channel.
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
