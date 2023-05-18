import { groupingCommand } from "./lib/grouping-command";
import { getSlackWebClient } from "./lib/common";

/**
 * This lambda is a lambda that will be executed on regular intervals
 * asking for a report on previous sequencing runs. Because it is triggered
 * via cron events we do not pass in settings via the invoke - but instead
 * set the settings in environment variables when it is installed.
 *
 * @param event
 */
export const handler = async (event: any) => {
  const bucket = process.env["BUCKET"];
  const fingerprintFolder = process.env["FINGERPRINT_FOLDER"];
  const channel = process.env["CHANNEL"];
  const expectRelatedRegex = process.env["EXPECT_RELATED_REGEX"];

  if (!fingerprintFolder || !bucket || !channel || !expectRelatedRegex)
    return {
      status:
        "not executed due to missing env variables BUCKET, FINGERPRINT_FOLDER, EXPECT_RELATED_REGEX or CHANNEL",
    };

  const days = process.env["DAYS"];
  const date = process.env["DATE"]; // WIP

  if (days && date)
    return {
      status:
        "not executed due to env variables DAYS and DATE both being specified",
    };

  // const slackSend = getSlackChanneller(channel);

  const web = await getSlackWebClient();

  // we are setting up to allow Slack commands - so we want the ability to alter this
  // channel per request
  // for the EventBridge cron lambda however we just do a regular Post
  const slackSend = async (slackMessage: any) => {
    slackMessage["channel"] = channel;
    await web.chat.postMessage(slackMessage);
  };

  /*await groupingCommand(
    fingerprintFolder,
    slackSend,
    0.75,
    expectRelatedRegex.toString(),
    days ? parseInt(days) : undefined
  ); */

  return {
    status: "done",
  };
};
