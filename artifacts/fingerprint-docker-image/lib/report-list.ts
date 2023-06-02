import { table } from "table";
import { UrlListResult } from "./url-list-by-regex";

/**
 * Produce a text report of a list operation.
 *
 * @param urls the urls returned from the list operation
 */
export async function reportList(urls: UrlListResult[]) {
  const tableData: string[][] = [];

  tableData.push(["BAM", "Last\nModified"]);

  for (const u of urls) tableData.push([u.url, u.lastModifiedMelbourne]);

  return table(tableData, {
    columns: [{ alignment: "left", width: 120 }],
  });
}
