import { table } from "table";
import { UrlListResult } from "./url-list-by-regex";

export async function reportList(urls: UrlListResult[]) {
  const tableData: string[][] = [];

  tableData.push(["BAM", "Last\nModified"]);

  for (const u of urls) tableData.push([u.url, u.lastModifiedMelbourne]);

  return table(tableData, {
    columns: [{ alignment: "left", width: 120 }],
  });
}
