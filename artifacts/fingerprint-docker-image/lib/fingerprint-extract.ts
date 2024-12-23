import { promisify } from "util";
import { execFile } from "child_process";
import { join } from "path";
import { URL } from "url";
import {
  PutObjectCommand,
  PutObjectCommandInput,
  S3Client,
} from "@aws-sdk/client-s3";
import { mkdir, readdir, readFile, rm, stat } from "fs/promises";
import { httpsDownload, s3Presign, urlToKey } from "./aws-misc";
import * as crypto from "node:crypto";
import {
  fingerprintBucketName,
  somalierBinary,
  somalierFasta,
  somalierSites,
  somalierWork,
} from "./environment-constants";
import axios from "axios";
import { chdir } from "process";
import { downloadReferenceData } from "./download-reference-data";

// it is sometimes useful to be able to fingerprint public reference samples that exist
// in open buckets - so this is the name of any buckets of that nature
// (we need to treat them separately as we need to make sure we *don't* pre-sign the URLs)
const KNOWN_OPEN_DATA_BUCKETS = [
  "giab",
  "1000genomes",
  "1000genomes-dragen",
  "1000genomes-dragen-3.7.6", // us-west-2
  "1000genomes-dragen-v3.7.6", // us-east-1
  "1000genomes-dragen-v4.0.3",
  "1000genomes-dragen-v4-2-7",
  "biorefdata", // ap-southeast-2,
  "gatk-sv-data-us-east-1",
  "gtgseq",
  "tcga-2-open",
];

const s3Client = new S3Client({});

/**
 * For the given reads file (as URL), perform a somalier extract to produce a
 * fingerprint object and save it to the fingerprint store.
 *
 * @param index a URL of a BAM/CRAM etc that we want to fingerprint
 * @param reference the part name of the reference data (sites/fasta) to use (e.g. "hg38.rna")
 * @param fingerprintFolder the fingerprint folder to store the resulting fingerprint in
 * @param individualId if present, the identifier string we want to tag this fingerprint with
 * @param libraryId if present, the identifier string for the library we want to tag this fingerprint with
 * @param excludeFromCheck if present, signifies that this fingerprint should never be compared by the check operation other then when it is passed in (is a control sample for instance)
 * @param autoExpire if present, tags the fingerprint so that it auto disappears from the db after a while (weeks)
 */
export async function fingerprintExtract(
  index: string,
  reference: string,
  fingerprintFolder: string,
  individualId: string | undefined,
  libraryId: string | undefined,
  excludeFromCheck: boolean | undefined,
  autoExpire: boolean | undefined
) {
  console.log(
    `Computing fingerprint for '${index}' into the folder '${fingerprintFolder}', with sbj='${individualId}' and lib='${libraryId}' and excludeFromCheck='${excludeFromCheck}' and autoExpire='${autoExpire}'`
  );

  // whether it is lambda or fargate we do our work in a folder we know to be read/write
  chdir(somalierWork);

  // setup the local env for extraction
  await downloadReferenceData(reference);

  // we create a working directory that we can clean up later
  const randomString = crypto.randomBytes(16).toString("hex");
  await mkdir(randomString);

  // this is a simple way to make sure our inputs conform to URL pattern
  const readsUrl = new URL(index);

  if (readsUrl.protocol !== "s3:")
    throw new Error(
      `Url protocol for ${readsUrl} is not one we currently support`
    );

  // we want to locate our index and download it locally
  const readsIndexLocalPath = `./${randomString}/index`;

  console.time("Download Index");
  {
    let readsIndexUrl: URL;
    let readsIndexHttpPath: string;

    if (index.endsWith(".bam")) {
      readsIndexUrl = new URL(index + ".bai");
    } else if (index.endsWith(".cram")) {
      readsIndexUrl = new URL(index + ".crai");
    } else {
      throw new Error(
        `Unknown file suffix for ${index} - must be .bam or .cram`
      );
    }

    console.log(`Downloaded index file determined to live at ${readsIndexUrl}`);

    // different paths for downloading open data v private data
    if (KNOWN_OPEN_DATA_BUCKETS.includes(readsIndexUrl.hostname)) {
      readsIndexHttpPath = `https://${readsIndexUrl.hostname}.s3.amazonaws.com${readsIndexUrl.pathname}`;
    } else {
      readsIndexHttpPath = await s3Presign(readsIndexUrl.toString());
    }

    console.log(
      `Downloaded index file can be downloaded from ${readsIndexHttpPath}`
    );

    await httpsDownload(readsIndexHttpPath, readsIndexLocalPath);

    const s = await stat(readsIndexLocalPath);

    console.log(`Downloaded index file size on disk is ${s.size}`);
  }
  console.timeEnd("Download Index");

  // the toFingerprintString is the eventual string we need to pass to somalier extract...
  // but depending on the protocol we need to do different things (i.e. it is not always just the index)
  let toFingerprintString: string;

  // rather than rely on the S3 support of the somalier binary (we don't have enough control of what libraries
  // are included for its build) - we construct links manually by pre-signing ourselves
  if (KNOWN_OPEN_DATA_BUCKETS.includes(readsUrl.hostname)) {
    // if the bucket is an OpenData public bucket - then we need to access directly
    const s3Url = `https://${readsUrl.hostname}.s3.amazonaws.com${readsUrl.pathname}`;

    await dumpFileHead(s3Url);

    toFingerprintString = `${s3Url}##idx##${readsIndexLocalPath}`;
  } else {
    // construct presigned HTTPS links and get it to source the BAMs that way
    const s3PresignedUrl = await s3Presign(index);

    await dumpFileHead(s3PresignedUrl);

    toFingerprintString = `${s3PresignedUrl}##idx##${readsIndexLocalPath}`;
  }

  const execFilePromise = promisify(execFile);

  console.time("somalier");

  // do a somalier extract to generate the fingerprint
  try {
    const args = [
      "extract",
      toFingerprintString,
      "-s",
      somalierSites,
      "-f",
      somalierFasta,
      "-d",
      randomString,
    ];

    console.log(`Executing ${somalierBinary} ${args.join(" ")}`);

    const promiseInvoke = execFilePromise(somalierBinary, args, {
      maxBuffer: 1024 * 1024 * 64,
    });

    const { stdout, stderr } = await promiseInvoke;

    console.log(`PID = ${promiseInvoke.child.pid}`);
    console.log(`Killed = ${promiseInvoke.child.killed}`);
    console.log(`Error code = ${promiseInvoke.child.exitCode}`);

    if (stdout) {
      stdout.split("\n").forEach((l) => console.log(`stdout ${l}`));
    }
    if (stderr) {
      stderr.split("\n").forEach((l) => console.log(`stderr ${l}`));
    }
  } finally {
    console.timeEnd("somalier");
  }

  // remove the reads index we downloaded
  await rm(readsIndexLocalPath, { force: true });

  const producedFileList = await readdir(randomString);

  if (producedFileList.length != 1) {
    throw new Error(
      `The somalier extract process created ${producedFileList.length} files when we were only expecting 1`
    );
  }

  // note the fingerprint file is only about 256k so is no problem to store in memory
  const fingerprintData = await readFile(
    join(randomString, producedFileList[0])
  );

  // cleanup the directory - we have 10Gb of docker storage to play with but best to at least try to
  // remove what we don't need
  await rm(randomString, { recursive: true, force: true });

  const m: Record<string, string> = {
    // note the key name is lower-cased automatically by AWS so we have no choice here
    "fingerprint-created": new Date().toISOString(),
  };

  if (individualId && individualId.trim().length > 0)
    m["individual-id"] = individualId.trim();

  // if (libraryId && libraryId.trim().length > 0)
  //  m["library-id"] = libraryId.trim();

  if (excludeFromCheck) m["exclude-from-check"] = true.toString();

  let tagging: string | undefined = undefined;

  if (autoExpire) tagging = "AutoExpire=7";

  // our *last* step is to upload to S3 - if anything above fails we don't want
  // any trace of this fingerprint in the 'done' fingerprints bucket
  const bucketParams: PutObjectCommandInput = {
    Bucket: fingerprintBucketName,
    Key: urlToKey(fingerprintFolder, readsUrl),
    Body: fingerprintData,
    Metadata: m,
    Tagging: tagging,
  };

  await s3Client.send(new PutObjectCommand(bucketParams));
}

/**
 * Useful proof of life of the (remote https) file we are about to send to somalier binary.
 * Given lots of our issues are to do with access/auth/file not found - this gives us
 * an early and useful error message if we can't read.
 *
 * @param httpUrl
 */
async function dumpFileHead(httpUrl: string) {
  const head = await axios.get(httpUrl, {
    headers: { Range: "bytes=0-64" },
  });

  console.log(head.status);
  console.log(head.statusText);
  console.log(head.headers);
}
