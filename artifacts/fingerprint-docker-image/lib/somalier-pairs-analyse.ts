import { parse } from "csv/sync";
import { keyToUrl } from "./aws";
import { HolmesReturnType, SomalierCommonType } from "./somalier-types";

/**
 * From the somalier output pairs file - we analyse all the pairs to find
 * expected and unexpected pairings.
 *
 * @param pairsTsv the pairs TSV file content as generated by somalier
 * @param fingerprintFolder the folder path of the fingerprints we are using
 * @param indexSampleIdToKeyMap the details of the indexes
 * @param sampleIdToKeyMap the details of the comparison samples
 * @param relatednessThreshold the threshold to apply for reporting relations
 * @param minimumNCount minimum N count of match to apply for positive relation reporting
 * @param expectRelatedRegex regex for pairs that should be related based on name
 */
export async function pairsAnalyse(
  pairsTsv: string,
  fingerprintFolder: string,
  indexSampleIdToKeyMap: { [sid: string]: string },
  sampleIdToKeyMap: { [sid: string]: string },
  relatednessThreshold: number,
  minimumNCount: number,
  expectRelatedRegex: RegExp
): Promise<{ [sid: string]: HolmesReturnType[] }> {
  const matches: { [url: string]: HolmesReturnType[] } = {};

  for (const indexSampleId of Object.keys(indexSampleIdToKeyMap)) {
    // the printable URL name of the index sample we are processing i.e. gds://foo/bar.bam
    const indexUrlAsString = keyToUrl(
      fingerprintFolder,
      indexSampleIdToKeyMap[indexSampleId]
    ).toString();

    console.log(
      `Extracting matches for index sample id ${indexSampleId} which = ${indexUrlAsString}/${indexSampleIdToKeyMap[indexSampleId]}`
    );

    const parser = parse(pairsTsv, {
      delimiter: "\t",
    });

    for (const record of parser) {
      // note we only are interested in relationships with an index - relations from sample to sample
      // are ignored
      if (record[0] !== indexSampleId && record[1] !== indexSampleId) continue;

      // the pairs are not necessarily always with our index case on the left (i.e. A)
      // so we will need to normalise the result order
      if (record[1] === indexSampleId) {
        console.log(`Did A/B swap for sample ${indexSampleId}`);
        // swap sample id
        [record[0], record[1]] = [record[1], record[0]];
        // hets a<->b
        [record[6], record[7]] = [record[7], record[6]];
        // hom_alts a<->b
        [record[10], record[11]] = [record[11], record[10]];
      }

      // note it is possible we are comparing against other 'indexes' (not just 'samples')
      // however - we expect that those matches will otherwise be reported correctly when the index
      // *is* eventually compared to the "index as a sample" (maybe in a completely different lambda)
      // so basically when we discover this condition we skip reporting here
      // lets suppose this example steps invoke and distribution map
      // indexes 1=s3://aaa and 2=s3://bbb
      // lambda #1 fingerprints 3=s3://aaa, 4=s3://ccc
      // if s3://aaa and s3://bbb are related to each other - we only need to report 1v3 and 2v3.. there
      // is no value in us reporting 1v2 (it is a duplicate of 2v3 and we are guaranteed this exists)
      if (record[1] in indexSampleIdToKeyMap) {
        console.log("Skipping comparison to other index");
        continue;
      }

      // all indexes should end up with a matches array - even if it ends up empty
      if (!(indexUrlAsString in matches)) matches[indexUrlAsString] = [];

      // the printable URL name of the sample we are comparing the index to
      const sampleUrlAsString = keyToUrl(
        fingerprintFolder,
        sampleIdToKeyMap[record[1]]
      ).toString();

      // we are an automatic match against ourselves irrespective of the settings - we just
      // want to report back the somalier results
      if (indexUrlAsString === sampleUrlAsString) {
        matches[indexUrlAsString].push(
          tsvRecordToReturnType("Self", record, sampleUrlAsString, "{}")
        );
        continue;
      }

      // this is score of sites matching the sites file locations - where this gets very
      // low the results are less than useful
      const n = parseInt(record[13]);

      // this score is not directional so does not need to be swapped as A<->B swap
      // (it does go negative though - but that just means they really aren't related!)
      const relatedness = parseFloat(record[2]);

      // see if the names of the files imply a relation
      let regexMatch = false;

      const indexRegexMatch = expectRelatedRegex.exec(indexUrlAsString);
      const sampleRegexMatch = expectRelatedRegex.exec(sampleUrlAsString);

      // we only need to do the regex check if they DO match the regexp AND there is a capture group in the regex
      if (
        indexRegexMatch &&
        sampleRegexMatch &&
        indexRegexMatch.length == sampleRegexMatch.length &&
        indexRegexMatch.length >= 2
      ) {
        // all the match groups of the regex need to match for us to declare this to be a "regex match"
        let allMatch = true;
        // match group 0 we skip as it is the whole regex match
        for (let i = 1; i < indexRegexMatch.length; i = i + 1) {
          if (indexRegexMatch[i] !== sampleRegexMatch[i]) {
            allMatch = false;
          }
        }

        if (allMatch) regexMatch = true;
      }

      const regexJson = JSON.stringify({
        // return the match groups that matched
        index: indexRegexMatch?.slice(1),
        sample: sampleRegexMatch?.slice(1),
      });

      // NOTE we DO NOT use the minimumNCount here - as ruling out relations with low N counts
      // is counterproductive for Unexpected Unrelated (a low N just means that we can't make strong assertions
      // which is why we *only* use it for Related)
      if (regexMatch && relatedness < relatednessThreshold) {
        // these appear to be genomically unrelated but the regex says they are - which means we report
        // that they are Unexpected Unrelated
        console.log(
          `UnexpectedUnrelated of ${relatedness} to sample id ${
            record[1]
          } which = ${sampleUrlAsString}/${sampleIdToKeyMap[record[1]]}`
        );

        matches[indexUrlAsString].push(
          tsvRecordToReturnType(
            "UnexpectedUnrelated",
            record,
            sampleUrlAsString,
            regexJson
          )
        );
      } else {
        // NOTE we introduce the minimumNCount here - because we don't want to make wild assertions
        // that samples are related on very weak evidence (a relatedness of 0.8 where N is say 10 - can
        // be entirely random)
        if (relatedness >= relatednessThreshold && n >= minimumNCount) {
          // if they are genomically related according to the threshold we want to report that
          // but we can report it as expected or unexpected
          if (regexMatch) {
            console.log(
              `ExpectedRelated of ${relatedness} to sample id ${
                record[1]
              } which = ${sampleUrlAsString}/${sampleIdToKeyMap[record[1]]}`
            );

            matches[indexUrlAsString].push(
              tsvRecordToReturnType(
                "ExpectedRelated",
                record,
                sampleUrlAsString,
                regexJson
              )
            );
          } else {
            console.log(
              `UnexpectedRelated of ${relatedness} to sample id ${
                record[1]
              } which = ${sampleUrlAsString}/${sampleIdToKeyMap[record[1]]}`
            );

            matches[indexUrlAsString].push(
              tsvRecordToReturnType(
                "UnexpectedRelated",
                record,
                sampleUrlAsString,
                regexJson
              )
            );
          }
        } else {
          // everyone else falls through here
          console.log(
            `Fall through sample id ${record[1]} which = ${sampleUrlAsString}/${
              sampleIdToKeyMap[record[1]]
            }`
          );
        }
      }
    }
  }

  return matches;
}

function tsvRecordToSomalierType(record: any): SomalierCommonType {
  return {
    relatedness: parseFloat(record[2]),
    ibs0: parseInt(record[3]),
    ibs2: parseInt(record[4]),
    hom_concordance: parseFloat(record[5]),
    hets_a: parseInt(record[6]),
    hets_b: parseInt(record[7]),
    hets_ab: parseInt(record[8]),
    shared_hets: parseInt(record[9]),
    hom_alts_a: parseInt(record[10]),
    hom_alts_b: parseInt(record[11]),
    shared_hom_alts: parseInt(record[12]),
    n: parseInt(record[13]),
    // confirm these are not directional too
    x_ibs0: parseInt(record[14]),
    x_ibs2: parseInt(record[15]),
  };
}

function tsvRecordToReturnType(
  type:
    | "Self"
    | "UnexpectedRelated"
    | "ExpectedRelated"
    | "UnexpectedUnrelated",
  record: any,
  fileComparedTo: string,
  regexJson: string
): HolmesReturnType {
  return {
    type: type,
    ...tsvRecordToSomalierType(record),
    file: fileComparedTo,
    regexJson: regexJson,
  };
}
