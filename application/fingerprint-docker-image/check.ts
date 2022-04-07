import { promisify } from "util";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createReadStream, createWriteStream } from "fs";
import { unlink, readdir, readFile } from "fs/promises";
import { chdir, env as envdict } from "process";
import { exec as execCallback } from "child_process";
import { pipeline as pipelineCallback, Readable } from "stream";
import { parse } from "csv-parse";
import { URL } from "url";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import axios from "axios";
import { getGdsFileAsPresigned, getIcaJwt } from "./gds";

// get this functionality as promise compatible funcs
const exec = promisify(execCallback);
const pipeline = promisify(pipelineCallback);

// by default we obviously want this setup to work correctly in a lambda
// HOWEVER, it is useful to be able to override these on an execution basis for local testing etc
// THIS IS STRICTLY FOR USE IN DEV SETUPS - THESE PATHS ARE NOT CHECKED OR WHITELISTED - BAD THINGS CAN
// HAPPEN IF YOU ARE LETTING PEOPLE INVOKE THIS AND LETTING THEM SET THE ENV VARIABLES
const somalierBinary = envdict["SOMALIER"] || "/var/task/somalier";
const somalierWork = envdict["SOMALIERTMP"] || "/tmp";

type EventInput = {
  index: string;
  relatednessThreshold: number;

  fingerprints: string[];
};

const streamToBuffer = (stream: any): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: any[] = [];
    stream.on("data", (chunk: any) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });

const s3Client = new S3Client({});

/**
 * Fetches a fingerprint (somalier) object from an object store and saves it to local
 * working directory. Along the way fixes the file so its somalier id is the left padded
 * 'count' (up to the previous sample id size).
 *
 * @param url the URL of the fingerprint (.somalier) file (GDS or S3)
 * @param count the count used to generate a new id
 */
const getFingerprintObject = async (url: URL, count: number) => {
  let fileBuffer: Buffer | null = null;

  if (url.protocol === "s3:") {
    let p = url.pathname;
    if (p.startsWith("/")) p = p.substr(1);

    console.log(`Trying S3 download for ${url.hostname} ${p}`);

    const data = await s3Client.send(
      new GetObjectCommand({
        Bucket: url.hostname,
        Key: p,
      })
    );

    fileBuffer = await streamToBuffer(data.Body);
  } else if (url.protocol === "gds:") {
    console.log(`Trying GDS download for ${url.hostname} ${url.pathname}`);

    const presignedUrl = await getGdsFileAsPresigned(
      url.hostname,
      url.pathname
    );

    const fileResponse = await axios.get(presignedUrl, {
      responseType: "arraybuffer",
    });

    fileBuffer = Buffer.from(fileResponse.data);
  } else {
    throw new Error(`Unknown file download technique for ${url}`);
  }

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
};

export const lambdaHandler = async (ev: EventInput, context: any) => {
  // only small areas of the lambda runtime are read/write so we need to make sure we are in a writeable working dir
  chdir(somalierWork);

  // sample 0 is always going to be our index case
  const indexSampleId = await getFingerprintObject(new URL(ev.index), 0);

  let count = 1;

  const results: any = {};

  // download and 'fix' the sample ids for all the other fingerprint files we have been passed
  for (const url of ev.fingerprints) {
    const newSampleId = await getFingerprintObject(new URL(url), count);
    results[newSampleId] = url;
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
            file: results[record[1]],
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
