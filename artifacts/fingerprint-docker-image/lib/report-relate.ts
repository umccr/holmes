import { parse, transform } from "csv/sync";
import { table } from "table";
import { createFriendlyIds } from "./misc";

function fixHeaderRow(row: string[]): string[] {
  return row.map((v) => {
    if (v.startsWith("#")) v = v.slice(1);

    v = v.replaceAll("_", "\n");

    return v;
  });
}

/**
 * Takes TSVs from a relate or relatex call and formats a
 * plain text report.
 *
 * @param samplesTsv
 * @param pairsTsv
 */
export async function reportRelate(samplesTsv: string, pairsTsv: string) {
  // we build this report string
  let reportText = "";

  // first we assign (and print) new identifiers to the BAM urls (otherwise the columns are too wide!)
  const sampleUrlToFriendlyId: { [url: string]: string } = {};

  {
    let sampleHeaderRead = false;
    const sampleUrls: string[] = [];
    const samplesParser = parse(samplesTsv, {
      delimiter: "\t",
    });
    const samplesCorrected = transform(samplesParser, (row: any[]) => {
      if (!sampleHeaderRead) {
        sampleHeaderRead = true;
      } else {
        // the second column of the samplesTsv is our BAM URL
        sampleUrls.push(row[1]);
      }
    });

    const friendlies = createFriendlyIds(sampleUrls, "A");
    for (let i = 0; i < sampleUrls.length; i++)
      sampleUrlToFriendlyId[sampleUrls[i]] = friendlies[i];
  }

  reportText += Object.entries(sampleUrlToFriendlyId)
    .map(([u, t]) => `${t} = ${u}`)
    .join("\n");

  reportText += "\n";

  {
    let sampleHeaderRead = false;

    const samplesParser = parse(samplesTsv, {
      delimiter: "\t",
    });
    const samplesCorrected = transform(samplesParser, (row: any[]) => {
      if (!sampleHeaderRead) {
        sampleHeaderRead = true;
        const newHeaderRow = fixHeaderRow(row);
        return [newHeaderRow[1], ...newHeaderRow.slice(7)];
      } else {
        return [sampleUrlToFriendlyId[row[1]], ...row.slice(7)];
      }
    });

    reportText += table(samplesCorrected, {});
  }

  let processedPairsHeader = false;
  const pairsParser = parse(pairsTsv, {
    delimiter: "\t",
  });
  const pairsCorrected = transform(pairsParser, (row: any[]) => {
    if (!processedPairsHeader) {
      processedPairsHeader = true;
      return fixHeaderRow(row).slice(0, 15);
    } else {
      const newRow: string[] = [...row];
      // a bit of safety - but also has the advantage of helping skip the header row!
      if (newRow[0] in sampleUrlToFriendlyId) {
        newRow[0] = sampleUrlToFriendlyId[newRow[0]];
      }
      if (newRow[1] in sampleUrlToFriendlyId) {
        newRow[1] = sampleUrlToFriendlyId[newRow[1]];
      }
      if (parseFloat(newRow[2]) >= 0.8) newRow[2] = newRow[2] + " 🔥";
      return newRow.slice(0, 15);
    }
  });

  reportText += table(pairsCorrected, {});

  return reportText;
}
