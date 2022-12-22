import { promisify } from "util";
import { chdir } from "process";
import { execFile } from "child_process";
import { join } from "path";
import { URL } from "url";
import { getGdsFileAsPresigned } from "./illumina-icav1";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mkdir, readdir, readFile, rm } from "fs/promises";
import { nanoid } from "nanoid/non-secure";
import { s3Presign, urlToKey } from "./aws";
import {
  fingerprintBucketName,
  safeGetFingerprintSites,
  somalierBinary,
  somalierFasta,
  somalierSites,
  somalierWork,
} from "./env";
import axios from "axios";
import * as rax from "retry-axios";

const s3Client = new S3Client({});

/**
 * Useful proof of life of the (remote https) files we are about to send to somalier binary.
 *
 * @param bamPresignedUrl
 * @param baiPresignedUrl
 */
async function dumpFileHead(bamPresignedUrl: string, baiPresignedUrl: string) {
  const bamHead = await axios.get(bamPresignedUrl, {
    headers: { Range: "bytes=0-64" },
  });

  console.log(bamHead.status);
  console.log(bamHead.statusText);
  console.log(bamHead.headers);

  const baiHead = await axios.get(baiPresignedUrl, {
    headers: { Range: "bytes=0-64" },
  });

  console.log(baiHead.status);
  console.log(baiHead.statusText);
  console.log(baiHead.headers);
}

/**
 * For the given BAM file, performa a somalier extract to produce a
 * fingerprint object and save it to the fingerprint store.
 *
 * @param file
 * @param fingerprintFolder
 */
async function fingerprint(file: string, fingerprintFolder: string) {
  console.log(`Computing fingerprint for ${file}`);

  // the index string is the eventual string we need to pass to somalier extract..
  // but depending on the protocol we need to do different things (i.e. it is not always just the index)
  let indexString;

  const url = new URL(file);

  if (url.protocol === "s3:") {
    // rather than rely on the S3 support of the somalier binary (we don't have enough control of what libraries
    // are included for its build) - we construct presigned HTTPS links and get it to source the BAMs that way
    const presignedUrl = await s3Presign(file);
    const presignedUrlBai = await s3Presign(file + ".bai");

    await dumpFileHead(presignedUrl, presignedUrlBai);

    indexString = `${presignedUrl}##idx##${presignedUrlBai}`;
  } else if (url.protocol === "gds:") {
    const presignedUrl = await getGdsFileAsPresigned(
      url.hostname,
      url.pathname
    );
    const presignedUrlBai = await getGdsFileAsPresigned(
      url.hostname,
      url.pathname + ".bai"
    );

    await dumpFileHead(presignedUrl, presignedUrlBai);

    // this is the undocumented mechanism of nim-htslib to have a path that also specifies the actual index file
    indexString = `${presignedUrl}##idx##${presignedUrlBai}`;
  } else {
    throw new Error(`Unknown file download technique for ${url}`);
  }

  const randomString = nanoid();

  await mkdir(randomString);

  const execFilePromise = promisify(execFile);

  // do a somalier extract to generate the fingerprint
  // TODO: send failure events to event bridge?
  try {
    const args = [
      "extract",
      indexString,
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

    console.log(`Error code = ${promiseInvoke.child.exitCode}`);

    if (stdout) {
      stdout.split("\n").forEach((l) => console.log(`stdout ${l}`));
    }
    if (stderr) {
      stderr.split("\n").forEach((l) => console.log(`stderr ${l}`));
    }
  } catch (e) {
    console.error("somalier extract invoke failed");
    console.error(e);
    return;
  }

  const producedFileList = await readdir(randomString);

  if (producedFileList.length != 1) {
    throw new Error(
      `The somalier extract process created ${producedFileList.length} files when we were only expecting 1`
    );
  }

  const fingerprintData = await readFile(
    join(randomString, producedFileList[0])
  );

  // cleanup the directory - we have 10Gb of docker storage to play with but best to at least try to
  // remove what we don't need
  await rm(randomString, { recursive: true, force: true });

  // our *last* step is to upload to S3 - if anything above fails we don't want
  // any trace of this fingerprint in the 'done' fingerprints bucket
  const bucketParams = {
    Bucket: fingerprintBucketName,
    Key: urlToKey(fingerprintFolder, url),
    Body: fingerprintData,
  };

  await s3Client.send(new PutObjectCommand(bucketParams));
}

/**
 * Perform the fingerprint extract for a set of files, according the the
 * given reference. The reference should match the inner portion of the sites filenames
 * that are located in the config/ folder of the fingerprint bucket. See docs
 * for more details but essentially for "config/sites.hg19.rna.vcf.gz" - the "reference" is
 * "hg19.rna".
 *
 * @param reference the string representing the genome build our BAM matches up with
 * @param fingerprintFolder the slash terminated folder path for where the fingerprints will be sent
 * @param files the list of source BAMs
 */
export async function extract(
  reference: string,
  fingerprintFolder: string,
  files: string[]
) {
  console.log("Starting extract task");

  // whether it is lambda or fargate we do our work in a folder we know to be read/write
  chdir(somalierWork);

  // setup the local env for extraction
  await safeGetFingerprintSites(reference);

  for (const file of files) {
    await fingerprint(file, fingerprintFolder);
  }
}
