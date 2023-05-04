import * as crypto from "crypto";
import { getSlackSigningSecret } from "./lib/common";
import yargsParser from "yargs-parser";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

/**
 * A handler that gets called as a result of a Slack hook
 * command integration. Its job is to return a "Ok" result (within 3sec)
 * and asynchronously invoke the actual working lambda that
 * can send post back a message later (10 seconds or more for some
 * of our fingerprint work).
 *
 * @param event
 */
export const handler = async (event: any) => {
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

  if (expectedSignature !== requestSignature)
    throw new Error(
      "Slack signature mismatch - see CloudWatch logs for details"
    );

  const params = new URLSearchParams(bodyString);

  const o = Object.fromEntries(
    Array.from(params.keys()).map((k) => [
      k,
      // note this won't handle repeated param keys, but we don't expect that from Slack command
      params.get(k),
    ])
  );

  if (!o.text) throw new Error("No text for the command in the Slack message");

  if (!o.command) throw new Error("No command in the Slack message");

  if (!o.response_url) throw new Error("No response_url in the Slack message");

  const argv = yargsParser(o.text);

  const commands: (string | number)[] = argv["_"] || [];

  if (commands.length < 1 || commands[0] === "help")
    return {
      response_type: "in_channel",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `
/fingerprint
 report bamurl [...bamurl] "report all relatedness of the given URLs against each other"
 check bamurl [...bamurl] "report threshold relatedness of the given URLs against the fingerprint database"
 help "this help"
            `,
          },
        },
      ],
    };
  const client = new LambdaClient({});

  const command = new InvokeCommand({
    FunctionName: process.env["LAMBDA_RESPONSE_GROUPING_ARN"],
    InvocationType: "Event",
    Payload: Buffer.from(
      JSON.stringify({
        slackResponseUrl: o.response_url,
      })
    ),
  });
  const response = await client.send(command);

  console.log(response);

  return {
    response_type: "in_channel",
  };
};

/*
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
