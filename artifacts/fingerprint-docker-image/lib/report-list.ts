import { table } from "table";

export async function reportList(urls: string[]) {
  const tableData: string[][] = [];

  tableData.push(["BAM"]);

  for (const u of urls) tableData.push([u]);

  return table(tableData, {
    singleLine: true,
    columns: [{ alignment: "left", width: 120 }],
  });
}
