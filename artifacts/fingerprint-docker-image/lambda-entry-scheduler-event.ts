import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { getFromEnv } from "./env";
import { formatInTimeZone } from "date-fns-tz";
import { subDays } from "date-fns";

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

  if (!bucket || !channel)
    return {
      status:
        "not executed due to missing env variables FINGERPRINT_BUCKET_NAME or CHANNEL",
    };

  // we want to find yesterdays date as a string
  const yesterday = subDays(new Date(), 1);

  const yesterdayString = formatInTimeZone(
    yesterday,
    "Australia/Melbourne",
    "yyyy-MM-dd"
  );

  // we now want to trigger a check operation - but using yesterdays date as the regex
  // to use for building the index cases
  const payloadAsJson = {
    ...getFromEnv(),
    channelId: channel,
    regexes: [yesterdayString],
  };

  console.log(JSON.stringify(payloadAsJson));

  const client = new LambdaClient({});

  const response = await client.send(
    new InvokeCommand({
      FunctionName: process.env["LAMBDA_CHECK_ARN"],
      InvocationType: "Event",
      Payload: Buffer.from(JSON.stringify(payloadAsJson)),
    })
  );

  console.log(response);

  return {
    status: "done",
  };
};
