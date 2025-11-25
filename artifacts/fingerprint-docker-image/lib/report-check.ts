import { table } from "table";
import { HolmesResultMapType } from "./distributed-map";
import { headS3Fingerprint } from "./s3-fingerprint-db/head-s3-fingerprint";
import { urlToKey } from "./aws-misc";

/**
 * Takes data from a check or checkx call and formats a
 * plain text report.
 *
 * @param relations
 * @param fingerprintBucketName
 * @param fingerprintFolder
 */
export async function reportCheck(
  relations: Record<string, HolmesResultMapType>,
  fingerprintBucketName: string,
  fingerprintFolder: string
) {
  // we build this report string
  let reportText = "";

  reportText += `ER = expected related
UR = unexpected related
UU = unexpected unrelated\n\n`;

  let reportUrBreakoutText: string[] = [];
  let reportUuBreakoutText: string[] = [];

  const tableData: any[][] = [];

  tableData.push([
    "Index URL",
    "ER\n(self + others)",
    "UR",
    "UU",
    "Individual",
  ]);

  // we want to display the indexes in alphabetic order (I mean why not!)
  for (const rKey of Object.keys(relations).sort()) {
    const m = relations[rKey];

    // now that we do not have subject ids in the filenames - we need to fetch them to report on them
    const rFingerprint = await headS3Fingerprint(
      fingerprintBucketName,
      fingerprintFolder,
      urlToKey(fingerprintFolder, URL.parse(rKey))
    );

    // TBD lookup external ids from API

    tableData.push([
      rKey,
      (m.self ? "1" : "0 ❗") + " + " + m.expectedRelated.length.toString(),
      m.unexpectedRelated.length === 0
        ? 0
        : m.unexpectedRelated.length.toString() + " ❌",
      m.unexpectedUnrelated.length === 0
        ? 0
        : m.unexpectedUnrelated.length.toString() + " ❌",
      rFingerprint.individualId || "<none>",
    ]);

    // if this index has unexpected related - create a breakout table
    // documenting that
    if (m.unexpectedRelated.length > 0) {
      const urTableData: any[][] = [];

      urTableData.push([
        "Other URL",
        "Relatedness",
        "N",
        "Other Individual",
        "Index Individual",
      ]);

      for (const ur of m.unexpectedRelated) {
        // similarly for the other samples - it helps to display the subject id
        // which we used to read from the filename
        const f = await headS3Fingerprint(
          fingerprintBucketName,
          fingerprintFolder,
          urlToKey(fingerprintFolder, URL.parse(ur.file))
        );

        urTableData.push([
          ur.file,
          ur.relatedness,
          ur.n,
          f.individualId || "<none>",
          rFingerprint?.individualId || "<none>",
        ]);
      }

      reportUrBreakoutText.push(
        table(urTableData, {
          header: {
            alignment: "center",
            content: `UR ${rKey}`,
          },
        })
      );
    }

    // if this index has unexpected unrelated - create a breakout table
    // documenting that
    if (m.unexpectedUnrelated.length > 0) {
      const uuTableData: any[][] = [];

      uuTableData.push([
        "Other URL",
        "Relatedness",
        "N",
        "Other Individual",
        "Index Individual",
      ]);

      for (const uu of m.unexpectedUnrelated) {
        // similarly for the other samples - it helps to display the subject id
        // which we used to read from the filename
        const f = await headS3Fingerprint(
          fingerprintBucketName,
          fingerprintFolder,
          urlToKey(fingerprintFolder, URL.parse(uu.file))
        );

        uuTableData.push([
          uu.file,
          uu.relatedness,
          uu.n,
          f.individualId || "<none>",
          rFingerprint?.individualId || "<none>",
        ]);
      }

      reportUuBreakoutText.push(
        table(uuTableData, {
          header: {
            alignment: "center",
            content: `UU ${rKey}`,
          },
        })
      );
    }
  }

  reportText += table(tableData, {}) + "\n\n";

  reportText += reportUrBreakoutText.join("\n");
  reportText += reportUuBreakoutText.join("\n");

  return reportText;
}
