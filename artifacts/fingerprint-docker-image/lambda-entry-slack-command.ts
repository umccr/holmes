import * as crypto from "crypto";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { MAX_CHECK, MAX_RELATE } from "./limits";
import { getFromEnv } from "./env";
import { getSlackSigningSecret } from "./lib/slack";

/**
 * A handler that gets called as a result of a Slack hook
 * command integration. Its job is to return a "Ok" result (within 3sec)
 * and asynchronously invoke the actual working lambda that
 * can send post back a message later (10 seconds or more for some
 * of our fingerprint work).
 *
 * @param event
 */
export const lambdaHandler = async (event: any) => {
  // we could probably use a proper serverless lambda <-> HTTP handler here - but
  // then we'd need to use Fastify/express etc
  // our needs are so simple we've just done it manually for the moment

  if (!event?.headers)
    throw new Error("Expected our lambda to be invoked via HTTP integration");

  // all examples of Slack sending us POSTS
  // *SO FAR* are converted by AWS http integration to base64
  if (!event.isBase64Encoded)
    throw new Error(
      "We are set up to expect the HTTP integration to be a base64 encoded body"
    );

  const requestSignature = event.headers["x-slack-signature"];
  const requestTimestamp = event.headers["x-slack-request-timestamp"];

  // request timestamp needs to be present and within a 5 minute window
  // (TBH our Slack commands are idempotent so its not a huge deal if they
  //  are replayed - but this is recommended)
  if (
    !requestTimestamp ||
    Math.abs(Math.floor(new Date().getTime() / 1000) - +requestTimestamp) >
      5 * 60
  )
    throw new Error("Request timestamp is too old - message replay?");

  const bodyBuffer = Buffer.from(event.body, "base64");
  const bodyString = bodyBuffer.toString("utf-8");

  const baseStr = `v0:${requestTimestamp}:${bodyString}`;

  const expectedSignature = `v0=${crypto
    .createHmac("sha256", await getSlackSigningSecret())
    .update(baseStr, "utf8")
    .digest("hex")}`;

  console.log(`timestamp = ${requestTimestamp}`);
  console.log(`calculated signature = ${expectedSignature}`);
  console.log(`header signature from Slack = ${requestSignature}`);

  if (expectedSignature !== requestSignature) {
    // NOTE we don't return a Slack message because this state means we did not get a valid
    // signed Slack request - so we can't trust anything
    throw new Error(
      "Slack signature mismatch - see CloudWatch logs for details"
    );
  }

  // convert the incoming URL params into an object
  const params = new URLSearchParams(bodyString);

  // example from docs
  // token=atoken
  // &team_id=T0001
  // &team_domain=example
  // &enterprise_id=E0001
  // &enterprise_name=Globular%20Construct%20Inc
  // &channel_id=C2147483705
  // &channel_name=test
  // &user_id=U2147483697
  // &user_name=Steve
  // &command=/weather
  // &text=94070
  // &response_url=https://hooks.slack.com/commands/1234/5678
  // &trigger_id=13345224609.738474920.8088930838d88f008e0
  // &api_app_id=A123456

  const o = Object.fromEntries(
    Array.from(params.keys()).map((k) => [
      k,
      // note this won't handle repeated param keys, but we don't expect that from Slack command
      params.get(k),
    ])
  );

  if (!o.command) throw new Error("No command in the Slack message");
  if (!o.text) throw new Error("No text for the command in the Slack message");
  if (!o.channel_id)
    throw new Error("No channel_id for the command in the Slack message");
  if (!o.response_url) throw new Error("No response_url in the Slack message");

  // log all the inputs
  console.log(JSON.stringify(o));

  // break up the input text by whitespace... though we note that various Slack formatting (```, ** etc)
  // can come through unintentionally if the person uses styles - and possibly we want to strip that off too?
  const textSplit = o.text.split(/\s+/);

  if (o.text.includes("help") || textSplit.length < 1)
    return {
      response_type: "ephemeral",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `
\`/fingerprint\`
     \`listx <re> [<re>...]\` return a list of fingerprints (and dates) with BAM URLs matching any RE
     \`checkx <re> [<re>...]\` report threshold relatedness of the BAM URLs matching any RE against the fingerprint database (max ${MAX_CHECK})
     \`relatex <re> [<re>...]\` report all relatedness of the BAM URLs matching any RE against each other (max ${MAX_RELATE})
     \`list <url> [<url>...]\` return a list of fingerprints (and dates) of the given BAM URLs
     \`check <url> [<url>...]\` report threshold relatedness of the given BAM URLs against the fingerprint database (max ${MAX_CHECK})
     \`relate <url> [<url>...]\` report all relatedness of the given BAM URLs against each other (max ${MAX_RELATE})
     \`ptc <url>\` report all relatedness of the given BAM URL against our known PTC reference samples
     \`help\` this help
            `,
          },
        },
      ],
    };

  // the sub command is the actual thing they want to do with the fingerprint service
  const subCommand = textSplit[0].toLowerCase().trim();

  // the sub command args are all the trailing text after the sub command
  const subCommandArgs = textSplit.slice(1);

  // because we can identify URLs we can be slightly more permissive on the URLs and only select know URI formats
  const subCommandArgsIfUrls: string[] = [];

  for (const item of subCommandArgs) {
    if (item.startsWith("gds://") || item.startsWith("s3://"))
      subCommandArgsIfUrls.push(item);
  }

  console.log(`Sub command = ${subCommand}`);
  console.log(`Sub command args = ${subCommandArgs}`);
  console.log(`Sub command url args = ${subCommandArgsIfUrls}`);

  // NOTE: there can be a mismatch between the subCommand name and the name of the lambda
  // we actually invoke. For instance, check and checkx as subcommands are both serviced by
  // a single CHECK_LAMBDA_ARN (just with different arguments passed)

  let lambdaArn: string | undefined;
  let lambdaPayloadJson: any;

  switch (subCommand) {
    case "listx":
      // before even invoking our list lambda - we try to catch any input that won't be a regexp
      // and instead immediately return an error response
      let currentListxR = "";
      try {
        for (currentListxR of subCommandArgs) {
          new RegExp(currentListxR);
        }
      } catch (e) {
        return {
          response_type: "ephemeral",
          text: `Sorry, Slack command 'listx' failed because input ${currentListxR} could not be interpreted as a regular expression`,
        };
      }
      lambdaArn = process.env["LAMBDA_LIST_ARN"];
      lambdaPayloadJson = {
        ...getFromEnv(),
        channelId: o.channel_id,
        indexes: [],
        regexes: subCommandArgs,
      };
      break;

    case "checkx":
      // before even invoking our check lambda - we try to catch any input that won't be a regexp
      // and instead immediately return an error response
      let currentCheckxR = "";
      try {
        for (currentCheckxR of subCommandArgs) {
          new RegExp(currentCheckxR);
        }
      } catch (e) {
        return {
          response_type: "ephemeral",
          text: `Sorry, Slack command 'checkx' failed because input ${currentCheckxR} could not be interpreted as a regular expression`,
        };
      }
      lambdaArn = process.env["LAMBDA_CHECK_ARN"];
      lambdaPayloadJson = {
        ...getFromEnv(),
        channelId: o.channel_id,
        regexes: subCommandArgs,
      };
      break;

    case "relatex":
      // before even invoking our relatex lambda - we try to catch any input that won't be a regexp
      // and instead immediately return an error response
      let currentRelatexR = "";
      try {
        for (currentRelatexR of subCommandArgs) {
          new RegExp(currentRelatexR);
        }
      } catch (e) {
        return {
          response_type: "ephemeral",
          text: `Sorry, Slack command 'relatex' failed because input ${currentRelatexR} could not be interpreted as a regular expression`,
        };
      }
      lambdaArn = process.env["LAMBDA_RELATE_ARN"];
      lambdaPayloadJson = {
        ...getFromEnv(),
        channelId: o.channel_id,
        regexes: subCommandArgs,
      };
      break;

    case "list":
      lambdaArn = process.env["LAMBDA_LIST_ARN"];
      lambdaPayloadJson = {
        ...getFromEnv(),
        channelId: o.channel_id,
        indexes: subCommandArgsIfUrls,
        regexes: [],
      };
      break;

    case "check":
      lambdaArn = process.env["LAMBDA_CHECK_ARN"];
      lambdaPayloadJson = {
        ...getFromEnv(),
        channelId: o.channel_id,
        indexes: subCommandArgsIfUrls,
      };
      break;

    case "relate":
      lambdaArn = process.env["LAMBDA_RELATE_ARN"];
      lambdaPayloadJson = {
        ...getFromEnv(),
        channelId: o.channel_id,
        indexes: subCommandArgsIfUrls,
      };
      break;

    case "ptc":
      if (subCommandArgsIfUrls.length != 1) {
        return {
          response_type: "ephemeral",
          text: `Sorry, Slack command 'ptc' failed because input needs to be exactly on PTC sample BAM URL`,
        };
      }
      lambdaArn = process.env["LAMBDA_RELATE_ARN"];
      lambdaPayloadJson = {
        ...getFromEnv(),
        fingerprintFolder: "fingerprints-controls/",
        channelId: o.channel_id,
        indexes: [
          ...subCommandArgsIfUrls,
          "gds://development/test-data/holmes-test-data/ptc/PTC_TsqN200511_N.bam",
        ],
      };
      break;

    default:
      return {
        response_type: "ephemeral",
        text: `Sorry, Slack sub-command \`${subCommand}\` was not understood by the Holmes \`${o.command}\` bot`,
      };
  }

  // because we have only 3 seconds to response to a Slack message - we need to asynchronously invoke
  // the subsequent lambda and just let it post back the response
  const client = new LambdaClient({});

  if (!lambdaArn)
    return {
      response_type: "ephemeral",
      text: `Sorry, Slack sub-command \`${subCommand}\` did not set the subsequent function to call - this is an internal error`,
    };

  console.log(`Payload being sent to lambda ${lambdaArn}`);
  console.log(JSON.stringify(lambdaPayloadJson));

  const lambdaCommand = new InvokeCommand({
    FunctionName: lambdaArn,
    InvocationType: "Event",
    Payload: Buffer.from(JSON.stringify(lambdaPayloadJson)),
  });

  const response = await client.send(lambdaCommand);

  console.log(response);

  // so we return nothing (of note) back in the 3 seconds - other than a plain result which lets it know it worked
  return {
    response_type: "in_channel",
    // our check commands are a bit slower than the others so we send back more info..
    text: subCommand.startsWith("check")
      ? "Fingerprint checks may take up to 30 seconds..."
      : undefined,
  };
};

/*
THE DUMP OF AN INCOMING RAW SLACK SLACK MESSAGE VIA LAMBDA FUNCTIONS

2023-01-30T06:34:53.733Z	b7634aa7-a9ec-4496-a918-2322d5c71198	INFO	{
  version: '2.0',
  routeKey: '$default',
  rawPath: '/',
  rawQueryString: '',
  headers: {
    'content-length': '421',
    'x-amzn-tls-version': 'TLSv1.2',
    'x-forwarded-proto': 'https',
    'x-forwarded-port': '443',
    'x-forwarded-for': '34.224.71.149',
    accept: 'application/json,*',
  'x-amzn-tls-cipher-suite': 'ECDHE-RSA-AES128-GCM-SHA256',
  host: 'xx.lambda-url.ap-southeast-2.on.aws',
  'content-type': 'application/x-www-form-urlencoded',
  'x-slack-request-timestamp': '1675060491',
  'x-slack-signature': 'v0=70e727bca61a17afb8eb4ca29bfe231e7457cda40d40d6de9ea3d7c04a7da462',
  'accept-encoding': 'gzip,deflate',
  'user-agent': 'Slackbot 1.0 (+https://api.slack.com/robots)'
},
requestContext: {
  accountId: 'anonymous',
    apiId: 'xx',
    domainName: 'xx.lambda-url.ap-southeast-2.on.aws',
    domainPrefix: 'xx',
    http: {
    method: 'POST',
      path: '/',
      protocol: 'HTTP/1.1',
      sourceIp: '34.224.71.149',
      userAgent: 'Slackbot 1.0 (+https://api.slack.com/robots)'
  },
  requestId: 'b7634aa7-a9ec-4496-a918-2322d5c71198',
    routeKey: '$default',
    stage: '$default',
    time: '30/Jan/2023:06:34:51 +0000',
    timeEpoch: 1675060491883
},
body: 'NQ==',
  isBase64Encoded: true
}
 */
