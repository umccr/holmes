import { table } from "table";
import { S3Fingerprint } from "./s3-fingerprint-db/s3-fingerprint";

/**
 * Produce a text report of a list operation.
 *
 * @param fingerprints the urls returned from the list operation
 */
export async function reportList(
  fingerprints: S3Fingerprint[]
): Promise<string> {
  const tableData: string[][] = [];

  tableData.push([
    "BAM",
    "Individual",
    "Library",
    "Created\nMelbourne",
    "Exclude From\nCheck",
  ]);

  for (const u of fingerprints)
    tableData.push([
      u.url?.toString() || "",
      u.individualId || "",
      u.libraryId || "",
      u.createdMelbourneDisplay || "",
      u.excludeFromCheck ? "Y" : "N",
    ]);

  return table(tableData, {
    columns: [{ alignment: "left", width: 120 }],
  });
}
