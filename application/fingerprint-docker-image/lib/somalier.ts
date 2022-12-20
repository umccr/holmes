import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { fingerprintBucketName, somalierBinary, somalierWork } from "./env";
import { streamToBuffer } from "./misc";
import { createReadStream, createWriteStream } from "fs";
import { pipeline as pipelineCallback, Readable } from "stream";
import { promisify } from "util";
import { parse } from "csv-parse";
import { keyToUrl } from "./aws";
import { readdir, readFile, unlink } from "fs/promises";
import { exec as execCallback } from "child_process";

// get this functionality as promise compatible function
const pipeline = promisify(pipelineCallback);
const exec = promisify(execCallback);

/**
 * Fetches a fingerprint (somalier) object from an object store and saves it to local
 * working directory. Along the way fixes the file so its somalier id is the left padded
 * 'count' (up to the previous sample id size).
 *
 * @param fingerprintKey the key in our fingerprint bucket of the fingerprint file to download
 * @param count the count used to generate a new id
 * @return the sample id we generated matching the count
 */
export async function downloadAndCorrectFingerprint(
  fingerprintKey: string,
  count: number
): Promise<string> {
  const s3Client = new S3Client({});

  let fileBuffer: Buffer | null = null;

  const data = await s3Client.send(
    new GetObjectCommand({
      Bucket: fingerprintBucketName,
      Key: fingerprintKey,
    })
  );

  fileBuffer = await streamToBuffer(data.Body);

  // check the file version matches what we expect
  const ver = fileBuffer.readInt8(0);
  if (ver !== 2)
    throw new Error(
      "Our fingerprint service is designed to only work with Somalier V2 fingerprint files"
    );

  // find out how much sample id space we have for our replacement sample ids
  const sampleIdLength = fileBuffer.readInt8(1);

  if (sampleIdLength < 2)
    throw new Error(
      "Due to the way we replace sample ids in Somalier we require all sample ids to be at least 2 characters for fingerprinting"
    );

  const newSampleId = count.toString().padStart(sampleIdLength, "0");
  fileBuffer.fill(newSampleId, 2, 2 + sampleIdLength);

  // now stream the buffer we have edited out to disk
  let writeStream = createWriteStream(
    `${somalierWork}/${newSampleId}.somalier`
  );
  await pipeline(Readable.from(fileBuffer), writeStream);

  // let the caller know what sample id we ended up generating for later matching
  return newSampleId;
}

export type MatchType = {
  file: string;
  relatedness: number;
  ibs0: number;
  ibs2: number;
  hom_concordance: number;
  hets_a: number;
  hets_b: number;
  hets_ab: number;
  shared_hets: number;
  hom_alts_a: number;
  hom_alts_b: number;
  shared_hom_alts: number;
  n: number;
  // confirm these are not directional too
  x_ibs0: number;
  x_ibs2: number;
};

function tsvRecordToMatchType(record: any, f: string): MatchType {
  return {
    file: f,
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

/**
 * From the somalier output pairs file - we extract only the matches that are against our
 * index files (as we are wanting to do a 1:n check for each index - not an all pairs check)
 *
 * @param fingerprintFolder the folder path of the fingerprints we are using
 * @param indexSampleIdToKeyMap the details of the indexes
 * @param sampleIdToKeyMap the details of the comparison samples
 * @param relatednessThreshold the threshold to apply for reporting
 */
export async function extractMatchesAgainstIndexes(
  fingerprintFolder: string,
  indexSampleIdToKeyMap: { [sid: string]: string },
  sampleIdToKeyMap: { [sid: string]: string },
  relatednessThreshold: number
): Promise<{ [sid: string]: MatchType[] }> {
  const matches: { [url: string]: MatchType[] } = {};

  for (const indexSampleId of Object.keys(indexSampleIdToKeyMap)) {
    const indexUrlAsString = keyToUrl(
      fingerprintFolder,
      indexSampleIdToKeyMap[indexSampleId]
    ).toString();

    const parser = createReadStream("somalier.pairs.tsv").pipe(
      parse({
        delimiter: "\t",
      })
    );

    for await (const record of parser) {
      if (record[0] === indexSampleId || record[1] === indexSampleId) {
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

        // this score is not directional so does not need to be swapped as A<->B swap
        // (it does go negative though - but that just means they really aren't related!)
        const relatedness = parseFloat(record[2]);

        if (relatedness >= relatednessThreshold) {
          if (!(indexUrlAsString in matches)) matches[indexUrlAsString] = [];

          matches[indexUrlAsString].push(
            tsvRecordToMatchType(
              record,
              keyToUrl(
                fingerprintFolder,
                sampleIdToKeyMap[record[1]]
              ).toString()
            )
          );
        }
      }
    }
  }

  return matches;
}

export async function extractAllPairs(
  fingerprintFolder: string,
  indexSampleIdToKeyMap: { [sid: string]: string }
): Promise<{ [sid: string]: MatchType[] }> {
  const matches: { [url: string]: MatchType[] } = {};

  const parser = createReadStream("somalier.pairs.tsv").pipe(
    parse({
      delimiter: "\t",
    })
  );

  for await (const record of parser) {
    const indexUrlAsString = keyToUrl(
      fingerprintFolder,
      indexSampleIdToKeyMap[record[0]]
    ).toString();

    const result = tsvRecordToMatchType(
      record,
      keyToUrl(fingerprintFolder, indexSampleIdToKeyMap[record[1]]).toString()
    );

    if (!(indexUrlAsString in matches)) matches[indexUrlAsString] = [];

    matches[indexUrlAsString].push(result);
  }

  return matches;
}
/**
 * Runs somalier relate on all .somalier files in the current directory
 * and outputs the stdout and stderr output for debug purposes.
 */
export async function runSomalierRelate() {
  // do a somalier relate run on everything we have downloaded
  const { stdout, stderr } = await exec(`${somalierBinary} relate *.somalier`, {
    env: {
      // somalier will keep pairs of very low relatedness out of the ouput - but for our use cases we mind as well
      // always include all output and use our own thresholds
      SOMALIER_REPORT_ALL_PAIRS: "1",
    },
  });

  if (stdout) {
    stdout.split("\n").forEach((l) => console.log(`stdout ${l}`));
  }
  if (stderr) {
    stderr.split("\n").forEach((l) => console.log(`stderr ${l}`));
  }

  const samples = await readFile("somalier.samples.tsv");
  const pairs = await readFile("somalier.pairs.tsv");

  if (samples) {
    samples
      .toString()
      .split("\n")
      .forEach((l) => console.log(`samples ${l}`));
  }
  if (pairs) {
    pairs
      .toString()
      .split("\n")
      .forEach((l) => console.log(`pairs ${l}`));
  }
}

/**
 * Remove our broad guess at any files that were used for input/output of the
 * somalier process. This is a ultra cautious step in case our Lambda is re-used
 * many many times and /tmp fills (possibly overly cautious!). Also we like to
 * use *.somalier for our actual exec of somalier - and we don't want it picking
 * up extraneous left over files from previous runs.
 */
export async function cleanSomalierFiles() {
  const allTmpFiles = await readdir(".", { withFileTypes: true });

  let somalierFingerprintRegex = /[.]somalier$/;
  let somalierOutputRegex = /somalier.*tsv$/;
  allTmpFiles.forEach((d) => {
    if (
      somalierFingerprintRegex.test(d.name) ||
      somalierOutputRegex.test(d.name)
    ) {
      console.log(`Removing ${d.name} from working directory`);
      unlink(d.name);
    }
  });
}
