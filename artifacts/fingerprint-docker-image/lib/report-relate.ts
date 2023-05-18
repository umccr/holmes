export async function reportRelate(
  slackSend: (msg: any) => void,
  samplesTsv: string,
  pairsTsv: string
) {
  if (!slackSend)
    throw new Error(
      "Cannot ask for Slack report without a way to send to Slack"
    );

  slackSend({
    text: samplesTsv + "\n" + pairsTsv,
  });
}
