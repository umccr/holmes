import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { getFromEnv } from "./env";
import { formatInTimeZone } from "date-fns-tz";
import { subDays } from "date-fns";
import { S3Client } from "@aws-sdk/client-s3";
import { urlListByRegex } from "./lib/url-list-by-regex";

/**
 * This lambda is a lambda that will be executed on regular intervals
 * asking for a report on previous sequencing runs. It will perform a check
 * using a regex of the previous days date.
 *
 * Because it is triggered via cron events we do not pass in settings via the lambda event - but instead
 * set the settings in environment variables when it is installed.
 *
 * @param event
 */
export const lambdaHandler = async (event: any) => {
  const bucket = process.env["FINGERPRINT_BUCKET_NAME"];
  const channel = process.env["CHANNEL"];
  const folder = process.env["FINGERPRINT_FOLDER"];

  if (!bucket || !channel || !folder)
    return {
      status:
        "not executed due to missing env variables FINGERPRINT_BUCKET_NAME or CHANNEL or FINGERPRINT_FOLDER",
    };

  // we want to find yesterday's date as a string
  const yesterday = subDays(new Date(), 1);

  const yesterdayString = formatInTimeZone(
    yesterday,
    "Australia/Melbourne",
    "yyyy-MM-dd"
  );

  // we do not execute the code directly but instead this lambda invokes the other
  // lambda operations
  const lambdaClient = new LambdaClient({});

  // we now want to trigger a check operation - but using yesterdays date as the regex
  // to use for building the index cases
  try {
    const checkPayloadAsJson = {
      ...getFromEnv(),
      channelId: channel,
      regexes: [yesterdayString],
    };

    console.log(JSON.stringify(checkPayloadAsJson));

    const checkResponse = await lambdaClient.send(
      new InvokeCommand({
        FunctionName: process.env["LAMBDA_CHECK_ARN"],
        InvocationType: "Event",
        Payload: Buffer.from(JSON.stringify(checkPayloadAsJson)),
      })
    );

    console.log(checkResponse);
  } catch (e) {
    console.log("Previous day check failed");
    console.error(e);
  }

  // we want to look for PTC samples from yesterday and run a control command
  try {
    // we need to do a custom version of this because unlike in general - we *want* PTCs
    const urls = await urlListByRegex(
      [yesterdayString + ".*PTC.*"],
      [],
      process.env["FINGERPRINT_FOLDER"]!,
      undefined
    );

    for (const ptcUrl of urls) {
      const controlPayloadAsJson = {
        index: ptcUrl.url,
        ...getFromEnv(),
        channelId: channel,
      };

      const controlResponse = await lambdaClient.send(
        new InvokeCommand({
          FunctionName: process.env["LAMBDA_CONTROL_ARN"],
          InvocationType: "Event",
          Payload: Buffer.from(JSON.stringify(controlPayloadAsJson)),
        })
      );
    }
  } catch (e) {
    console.log("Control sample processing failed");
    console.error(e);
  }

  return {
    status: "done",
  };
};
