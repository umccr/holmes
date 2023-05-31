import { parse, stringify, transform } from "csv/sync";

/**
 * For a somalier TSV file (either pairs or samples) - correct the sample ids so that
 * they in fact are the BAM Urls.
 *
 * @param indexSampleIdToBamUrlMap a map of sample ids to BAM urls
 * @param tsv the TSV content including a header row
 * @param tsvCorrectionColumns an array of column numbers to correct
 */
export async function somalierTsvCorrectIds(
  indexSampleIdToBamUrlMap: { [sid: string]: string },
  tsv: string,
  tsvCorrectionColumns: number[]
) {
  let headerRow: any[];

  const pairsParser = parse(tsv, {
    delimiter: "\t",
  });
  const pairsCorrected = transform(pairsParser, (row) => {
    if (!headerRow) headerRow = row;
    else {
      for (const c of tsvCorrectionColumns) {
        if (!(row[c] in indexSampleIdToBamUrlMap))
          throw new Error(
            `Parsing somalier TSV with unknown sample id ${row[c]} in designated column ${c}`
          );
        row[c] = indexSampleIdToBamUrlMap[row[c]];
      }
    }

    return row;
  });

  return stringify(pairsCorrected, { delimiter: "\t" });
}
