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
  }

  reportText += table(tableData, {});
  reportText += `  ER = expected related
  UR = unexpected related
  UU = unexpected unrelated
  `;

  return reportText;
}
