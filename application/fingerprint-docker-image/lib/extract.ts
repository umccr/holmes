import { promisify } from "util";
import { chdir } from "process";
import { execFile } from "child_process";
import { join } from "path";
import { URL } from "url";
import { getGdsFileAsPresigned } from "./illumina-icav1";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mkdir, readdir, readFile, rm } from "fs/promises";
import { nanoid } from "nanoid/non-secure";
import { s3Download, urlToKey } from "./aws";
import {
  fingerprintBucketName,
  somalierBinary,
  somalierFasta,
  somalierFastaBucketKey,
  somalierFastaBucketName,
  somalierSites,
  somalierSitesBucketKey,
  somalierSitesBucketName,
  somalierWork,
} from "./env";
import axios from "axios";
import * as rax from "retry-axios";

const s3Client = new S3Client({});

async function fingerprint(file: string, sitesChecksum: string) {
  console.log(`Computing fingerprint for ${file}`);

  // the index string is the eventual string we need to pass to somalier extract..
  // but depending on the protocol we need to do different things (i.e. it is not always just the index)
  let indexString;

  const url = new URL(file);

  if (url.protocol === "s3:") {
    indexString = file;

    // rather than rely on somalier binary S3 support - we should do the same as GDS here - turn
    // both bam and bai into signed s3 urls - and pass them

    throw new Error(
      "S3 links are currently disabled as the somalier binary seems to have a problem streaming them in AWS"
    );
  } else if (url.protocol === "gds:") {
    const presignedUrl = await getGdsFileAsPresigned(
      url.hostname,
      url.pathname
    );

    // we have some BAM files we will find with no index.. these we can ignore.. TEMP FIX
    let presignedUrlBai;
    try {
      presignedUrlBai = await getGdsFileAsPresigned(
        url.hostname,
        url.pathname + ".bai"
      );
    } catch (e) {
      return;
    }

    const bamHead = await axios.get(presignedUrl, {
      headers: { Range: "bytes=0-64" },
    });

    console.log(bamHead.status);
    console.log(bamHead.statusText);
    console.log(bamHead.headers);

    const baiHead = await axios.get(presignedUrlBai, {
      headers: { Range: "bytes=0-64" },
    });

    console.log(baiHead.status);
    console.log(baiHead.statusText);
    console.log(baiHead.headers);

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
    const { stdout, stderr } = await execFilePromise(
      somalierBinary,
      [
        "extract",
        indexString,
        "-s",
        somalierSites,
        "-f",
        somalierFasta,
        "-d",
        randomString,
      ],
      { maxBuffer: 1024 * 1024 * 64 }
    );

    if (stdout) {
      stdout.split("\n").forEach((l) => console.log(`stdout ${l}`));
    }
    if (stderr) {
      stderr.split("\n").forEach((l) => console.log(`stderr ${l}`));
    }
  } catch (e) {
    console.log(e);
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
    Key: urlToKey(url),
    Body: fingerprintData,
  };

  await s3Client.send(new PutObjectCommand(bucketParams));
}

export async function extract(files: string[]) {
  console.log("Starting extract task");

  // whether it is lambda or fargate we do our work in a folder we know to be read/write
  chdir(somalierWork);

  // bring down the reference data files locally
  // (because for debug we can place these files directly in the docker image - we are loose about
  //  whether the FASTA_BUCKET_NAME environment variables etc are actually defined -
  //  we check them if we need them inside download() )
  console.log("Obtaining reference genome fasta");
  await s3Download(
    somalierFastaBucketName,
    somalierFastaBucketKey,
    somalierFasta
  );

  console.log("Obtaining reference Somalier sites");
  const sitesChecksum = await s3Download(
    somalierSitesBucketName,
    somalierSitesBucketKey,
    somalierSites,
    true
  );

  if (!sitesChecksum) {
    throw new Error("Sites file checksum could not be computed");
  }

  for (const file of files) {
    await fingerprint(file, sitesChecksum);
  }
}
