import { promisify } from "util";
import { chdir, env as envDict } from "process";
import { execFile as execFileCallback } from "child_process";
import { URL } from "url";
import { getGdsFileAsPresigned } from "./gds";
import { argv } from "process";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { createWriteStream } from "fs";

const util = require("util");
const stream = require("stream");

const pipeline = util.promisify(stream.pipeline);

// get this functionality as promise compatible funcs
const execFile = promisify(execFileCallback);

// by default, we obviously want this setup to work correctly in a standalone fargate
// HOWEVER, it is useful to be able to override these on an execution basis for local testing etc
// THIS IS STRICTLY FOR USE IN DEV SETUPS - THESE PATHS ARE NOT CHECKED OR WHITELISTED - BAD THINGS CAN
// HAPPEN IF YOU ARE LETTING PEOPLE INVOKE THIS AND LETTING THEM SET THE ENV VARIABLES
const somalierBinary = envDict["SOMALIER"] || "/var/task/somalier";
const somalierWork = envDict["SOMALIERTMP"] || "/tmp";
const somalierSites = envDict["SOMALIERSITES"] || "/tmp/sites.vcf.gz";
const somalierFasta = envDict["SOMALIERFASTA"] || "/tmp/reference.fasta";

async function download(bucket: string, key: string, output: string) {
  const bucketParams = {
    Bucket: bucket,
    Key: key,
  };

  const client = new S3Client({});
  const command = new GetObjectCommand(bucketParams);
  const response = await client.send(command);

  await pipeline(response.Body, createWriteStream(output));
}

async function main() {
  // only small areas of the lambda runtime are read/write so we need to make sure we are in a writeable working dir
  chdir(somalierWork);

  await download(
    "umccr-refdata-prod",
    "genomes/hg38/hg38.fa",
    "reference.fasta"
  );
  await download(
    "umccr-refdata-prod",
    "somalier/sites.hg38.rna.vcf.gz",
    "sites.vcf.gz"
  );

  for (const file of argv.slice(2)) {
    console.log(`Computing fingerprint for ${file}`);

    // the index string is the eventual string we need to pass to somalier extract..
    // but depending on the protocol we need to do different things (i.e. it is not always just the index)
    let indexString;

    const url = new URL(file);

    if (url.protocol === "s3:") {
      indexString = file;
    } else if (url.protocol === "gds:") {
      const presignedUrl = await getGdsFileAsPresigned(
        url.hostname,
        url.pathname
      );
      const presignedUrlBai = await getGdsFileAsPresigned(
        url.hostname,
        url.pathname + ".bai"
      );

      // this is the undocumented mechanism of nim-htslib to have a path that also specifies the actual index file
      indexString = `${presignedUrl}##idx##${presignedUrlBai}`;
    } else {
      throw new Error(`Unknown file download technique for ${url}`);
    }

    // do a somalier extract to generate the fingerprint
    const { stdout, stderr } = await execFile(somalierBinary, [
      "extract",
      indexString,
      "-s",
      somalierSites,
      "-f",
      somalierFasta,
    ]);

    if (stdout) {
      stdout.split("\n").forEach((l) => console.log(`stdout ${l}`));
    }
    if (stderr) {
      stderr.split("\n").forEach((l) => console.log(`stderr ${l}`));
    }
  }
}

(async () => {
  await main();
})();
