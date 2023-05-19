import { table } from "table";

export async function reportExists(
  slackSend: (msg: any) => Promise<any>,
  exists: { [url: string]: boolean }
) {
  if (!slackSend)
    throw new Error(
      "Cannot ask for Slack report without a way to send to Slack"
    );

  const tableData: string[][] = [];

  tableData.push(["BAM", "Exists"]);

  for (const [url, e] of Object.entries(exists)) {
    tableData.push([url, `${e}`]);
  }

  const tableText = table(tableData, {
    header: {
      alignment: "center",
      content: "Fingerprints",
    },
    columns: [{ alignment: "left", width: 120 }, { alignment: "center" }],
  });

  await slackSend({
    text: "```" + tableText + "```",
  });
}
