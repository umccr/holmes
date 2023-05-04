import { IncomingWebhook } from "@slack/webhook";
import { reportCommand } from "./lib/report-command";

interface Event {
  slackResponseUrl: string;
  indexUrls: string[];
}

/**
 * A handler for performing a report on a set of indexes
 * and sending the result back as a text table.
 *
 * @param event
 */
export const handler = async (event: Event) => {
  // set up our way of communicating back to Slack
  const webhook = new IncomingWebhook(event.slackResponseUrl);

  const slackSend = async (slackMessage: any) => {
    await webhook.send(slackMessage);
  };

  const fingerprintFolder = process.env["FINGERPRINT_FOLDER"];

  if (!fingerprintFolder) {
    await slackSend({
      message: "Missing FINGERPRINT_FOLDER",
    });
    return {};
  }

  await reportCommand(fingerprintFolder, slackSend, event.indexUrls);

  return {};
};
