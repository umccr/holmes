import { promisify } from "util";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createReadStream, createWriteStream } from "fs";
import { readdir, readFile, unlink } from "fs/promises";
import { chdir } from "process";
import { exec as execCallback } from "child_process";
import { pipeline as pipelineCallback, Readable } from "stream";
import { parse } from "csv-parse";
import { URL } from "url";
import { streamToBuffer } from "./lib/misc";
import { fingerprintBucketName, somalierBinary, somalierWork } from "./lib/env";
import { keyToUrl, urlToKey } from "./lib/aws";

// get this functionality as promise compatible funcs
const exec = promisify(execCallback);
const pipeline = promisify(pipelineCallback);

type EventInput = {
  // the URL of a BAM we are checking against all others
  index: string;

  // the sites file checksum we are using for all our comparisons
  sitesChecksum: string;

  // the relatedness threshold to report against
  relatednessThreshold: number;

  // a set of fingerprint URLs which we will check the index against
  fingerprints: string[];
};

const s3Client = new S3Client({});

/**
 * Fetches a fingerprint (somalier) object from an object store and saves it to local
 * working directory. Along the way fixes the file so its somalier id is the left padded
 * 'count' (up to the previous sample id size).
 *
 * @param fingerprintKey the key in our fingerprint of our fingerprint file to load
 * @param count the count used to generate a new id
 * @return the sample id we generated matching the count
 */
async function getFingerprintObject(
  fingerprintKey: string,
  count: number
): Promise<string> {
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
      "The fingerprint check lambda can only work with Somalier V2 fingerprint files"
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

/**
 * A lambda which does the main work of comparing fingerprint files
 * using the somalier command line tool.
 *
 * It is passed an index fingerprint file and compares it to a small subset of
 * other fingerprint files (all in a fingerprint bucket in S3).
 *
 * There are file naming conventions on the fingerprint files which allow us
 * to work out what source BAMs created them - though we do not deal with
 * any of that logic here.
 *
 * The underlying assumption is that all fingerprint files exactly match
 * on corresponding sites.yaml file that was used to create them - but again
 * that logic is not dealt with here.
 *
 * @param ev
 * @param context
 */
export const lambdaHandler = async (ev: EventInput, context: any) => {
  // only small areas of the lambda runtime are read/write so we need to make sure we are in a writeable working dir
  chdir(somalierWork);

  const indexAsKey = urlToKey(ev.sitesChecksum, new URL(ev.index));

  // sample 0 is always going to be our index case
  // (and unlike the fingerprints it comes in as a URL BAM file location)
  const indexSampleId = await getFingerprintObject(indexAsKey, 0);

  let count = 1;

  const results: any = {};

  // download and 'fix' the sample ids for all the other fingerprint files we have been passed
  for (const fingerprintUrl of ev.fingerprints) {
    const fingerprintAsKey = urlToKey(
      ev.sitesChecksum,
      new URL(fingerprintUrl)
    );
    const newSampleId = await getFingerprintObject(fingerprintAsKey, count);
    results[newSampleId] = fingerprintAsKey;
    count++;
  }

  // do a somalier relate run on everything we have downloaded
  const { stdout, stderr } = await exec(`${somalierBinary} relate *.somalier`);

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

  const processFile = async () => {
    let matches = [];
    const parser = createReadStream("somalier.pairs.tsv").pipe(
      parse({
        delimiter: "\t",
      })
    );

    for await (const record of parser) {
      if (record[0] === indexSampleId || record[1] === indexSampleId) {
        // the pairs are not necessarily always with our index case on the left (i.e. A)
        // so we will need to normalise the results
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
        // (it does go negative though)
        const relatedness = parseFloat(record[2]);

        if (relatedness >= ev.relatednessThreshold) {
          const result: any = {
            file: keyToUrl(ev.sitesChecksum, results[record[1]]),
            relatedness: relatedness,
            // TODO: confirm these are not directional scores
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

          matches.push(result);
        }
      }
    }
    return matches;
  };

  const matches = await processFile();

  const allTmpFiles = await readdir(".", { withFileTypes: true });

  let regex = /[.]somalier$/;
  allTmpFiles.forEach((d) => {
    if (regex.test(d.name)) {
      console.log(`Removing ${d.name} from working directory`);
      unlink(d.name);
    }
  });

  return { matches: matches };
};
