import { parse, transform } from "csv/sync";
import { table } from "table";

function fixHeaderRow(row: string[]): string[] {
  return row.map((v) => {
    if (v.startsWith("#")) v = v.slice(1);

    v = v.replaceAll("_", "\n");

    // some minor corrections to make the tables make more sense
    if (v === "sample\nid") return "sample url";

    if (v === "sample\nb") return "control sample";

    return v;
  });
}

/**
 * Takes TSVs from a somalier report and formats a
 * plain text report for use in the "control" report.
 *
 * @param indexBamUrl the main BAM URL that we want to make the hilight of the report
 * @param samplesTsv
 * @param pairsTsv
 */
export async function reportControl(
  indexBamUrl: string,
  samplesTsv: string,
  pairsTsv: string
) {
  // we build this report string
  let reportText = "";

  {
    let sampleHeaderRead = false;

    const samplesParser = parse(samplesTsv, {
      delimiter: "\t",
    });

    // for our report on the stats of the PTC sample - we don't include some of the X, Y data as it gives our
    // table more space - and they are kind of not needed for control samples
    const START_INCLUDE_COLUMN = 7;
    const END_INCLUDE_COLUMN = 17;

    const samplesCorrected = transform(samplesParser, (row: any[]) => {
      if (!sampleHeaderRead) {
        sampleHeaderRead = true;
        const newHeaderRow = fixHeaderRow(row);
        return [
          newHeaderRow[1],
          ...newHeaderRow.slice(START_INCLUDE_COLUMN, END_INCLUDE_COLUMN),
        ];
      } else {
        if (row[1] === indexBamUrl)
          return [
            row[1],
            ...row.slice(START_INCLUDE_COLUMN, END_INCLUDE_COLUMN),
          ];
        else return [];
      }
    });

    const samplesCorrectedSkipBlanks = samplesCorrected.filter(
      (row) => row.length > 0
    );

    reportText += table(samplesCorrectedSkipBlanks, {});
  }

  let processedPairsHeader = false;
  const pairsParser = parse(pairsTsv, {
    delimiter: "\t",
  });
  const pairsCorrected = transform(pairsParser, (row: any[]) => {
    if (!processedPairsHeader) {
      processedPairsHeader = true;
      return fixHeaderRow(row).slice(1, 15);
    } else {
      const newRow: string[] = [...row];
      // a bit of safety - but also has the advantage of helping skip the header row!
      if (newRow[0] !== indexBamUrl) {
        return [];
      }
      // if (newRow[1] in sampleUrlToFriendlyId) {
      //  newRow[1] = sampleUrlToFriendlyId[newRow[1]];
      //}
      if (parseFloat(newRow[2]) >= 0.8) newRow[2] = newRow[2] + " 🔥";
      return newRow.slice(1, 15);
    }
  });

  const pairsCorrectedSkipBlanks = pairsCorrected.filter(
    (row) => row.length > 0
  );

  reportText += table(pairsCorrectedSkipBlanks, {});

  return reportText;
}
