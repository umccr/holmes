export async function reportExists(
  slackSend: (msg: any) => void,
  exists: { [url: string]: boolean }
) {
  if (!slackSend)
    throw new Error(
      "Cannot ask for Slack report without a way to send to Slack"
    );

  slackSend({
    text: `The exists report has ${Object.entries(exists).length} entries`,
  });
}
