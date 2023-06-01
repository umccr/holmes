import { table } from "table";
import { HolmesResultMapType } from "./distributed-map";

/**
 * Takes data from a check or checkx call and formats a
 * plain text report.
 *
 * @param relations
 */
export async function reportCheck(
  relations: Record<string, HolmesResultMapType>
) {
  // we build this report string
  let reportText = "";

  reportText += `ER = expected related
UR = unexpected related
UU = unexpected unrelated\n\n`;

  let reportUrBreakoutText: string[] = [];
  let reportUuBreakoutText: string[] = [];

  const tableData: any[][] = [];

  tableData.push(["Index URL", "ER\n(self + others)", "UR", "UU"]);

  // we want to display the indexes in alphabetic order (I mean why not!)
  for (const rKey of Object.keys(relations).sort()) {
    const m = relations[rKey];

    tableData.push([
      rKey,
      (m.self ? "1" : "0 ❗") + " + " + m.expectedRelated.length.toString(),
      m.unexpectedRelated.length === 0
        ? 0
        : m.unexpectedRelated.length.toString() + " ❌",
      m.unexpectedUnrelated.length === 0
        ? 0
        : m.unexpectedUnrelated.length.toString() + " ❌",
    ]);

    if (m.unexpectedRelated.length > 0) {
      const urTableData: any[][] = [];

      urTableData.push(["Other URL", "Relatedness", "N"]);

      for (const ur of m.unexpectedRelated) {
        urTableData.push([ur.file, ur.relatedness, ur.n]);
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

    if (m.unexpectedUnrelated.length > 0) {
      const uuTableData: any[][] = [];

      uuTableData.push(["Other URL", "Relatedness", "N"]);

      for (const uu of m.unexpectedUnrelated) {
        uuTableData.push([uu.file, uu.relatedness, uu.n]);
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
