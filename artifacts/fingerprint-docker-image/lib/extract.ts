import { promisify } from "util";
import { chdir } from "process";
import { execFile } from "child_process";
import { join } from "path";
import { URL } from "url";
import { getGdsFileAsPresigned } from "./illumina-icav1";
import {
  PutObjectCommand,
  PutObjectCommandInput,
  S3Client,
} from "@aws-sdk/client-s3";
import { mkdir, readdir, readFile, rm } from "fs/promises";
import { nanoid } from "nanoid/non-secure";
import { httpsDownload, s3Presign, urlToKey } from "./aws";
import {
  fingerprintBucketName,
  safeGetFingerprintSites,
  somalierBinary,
  somalierFasta,
  somalierSites,
  somalierWork,
} from "./env";
import axios from "axios";

// it is sometimes useful to be able to fingerprint public reference samples that exist
// in open buckets - so this is the name of any buckets of that nature
// (we need to treat them separately as we need to make sure we *don't* auth)
const KNOWN_OPEN_DATA_BUCKETS = [
  "giab",
  "1000genomes",
  "1000genomes-dragen",
  "1000genomes-dragen-3.7.6", // us-west-2
  "1000genomes-dragen-v3.7.6", // us-east-1
  "biorefdata", // ap-southeast-2,
  "gatk-sv-data-us-east-1",
];

const s3Client = new S3Client({});

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

/**
 * For the given reads file (as URL), perform a somalier extract to produce a
 * fingerprint object and save it to the fingerprint store.
 *
 * @param readsUrlString a URL of a BAM/CRAM etc that we want to fingerprint
 * @param fingerprintFolder the fingerprint folder to store the resulting fingerprint in
 */
async function fingerprint(readsUrlString: string, fingerprintFolder: string) {
  console.log(`Computing fingerprint for ${readsUrlString}`);

  // we create a working directory that we can cleanup later
  const randomString = nanoid();
  await mkdir(randomString);

  // this is a simple way to make sure our inputs conform to URL pattern
  const readsUrl = new URL(readsUrlString);

  let readsIndexUrl: URL;

  // we want to locate our reads index so we can download it locally later
  if (readsUrlString.endsWith(".bam")) {
    readsIndexUrl = new URL(readsUrlString + ".bai");
  } else if (readsUrlString.endsWith(".cram")) {
    readsIndexUrl = new URL(readsUrlString + ".crai");
  } else {
    throw new Error(
      `Unknown file suffix for ${readsUrlString} - must be .bam or .cram`
    );
  }

  const indexLocalPath = `./${randomString}/index`;

  // the index string is the eventual string we need to pass to somalier extract..
  // but depending on the protocol we need to do different things (i.e. it is not always just the index)
  let toFingerprintString;

  switch (readsUrl.protocol) {
    case "s3:":
      // rather than rely on the S3 support of the somalier binary (we don't have enough control of what libraries
      // are included for its build) - we construct links manually by pre-signing ourselves

      if (KNOWN_OPEN_DATA_BUCKETS.includes(readsUrl.hostname)) {
        // if the bucket is an OpenData public bucket - then we need to access directly
        const s3Url = `https://${readsUrl.hostname}.s3.amazonaws.com${readsUrl.pathname}`;
        //const s3UrlBai = `https://${readsUrl.hostname}.s3.amazonaws.com${readsUrl.pathname}.bai`;

        await dumpFileHead(s3Url);
        //await dumpFileHead(s3UrlBai);

        await httpsDownload(
          `https://${readsIndexUrl.hostname}.s3.amazonaws.com${readsIndexUrl.pathname}`,
          indexLocalPath
        );

        // toFingerprintString = `${s3Url}##idx##${s3UrlBai}`;
        toFingerprintString = `${s3Url}##idx##${indexLocalPath}`;
      } else {
        // otherwise for the more normal authed access - we construct presigned HTTPS links and get it to source the BAMs that way
        const s3PresignedUrl = await s3Presign(readsUrlString);
        //const s3PresignedUrlBai = await s3Presign(readsUrlString + ".bai");

        await dumpFileHead(s3PresignedUrl);
        //await dumpFileHead(s3PresignedUrlBai);

        await httpsDownload(
          await s3Presign(readsIndexUrl.toString()),
          indexLocalPath
        );

        // toFingerprintString = `${s3PresignedUrl}##idx##${s3PresignedUrlBai}`;
        toFingerprintString = `${s3PresignedUrl}##idx##${indexLocalPath}`;
      }
      break;

    case "gds:":
      const gdsPresignedUrl = await getGdsFileAsPresigned(
        readsUrl.hostname,
        readsUrl.pathname
      );
      const gdsPresignedUrlBai = await getGdsFileAsPresigned(
        readsUrl.hostname,
        readsUrl.pathname + ".bai"
      );

      await dumpFileHead(gdsPresignedUrl);
      await dumpFileHead(gdsPresignedUrlBai);

      await httpsDownload(
        await getGdsFileAsPresigned(
          readsIndexUrl.hostname,
          readsIndexUrl.pathname
        ),
        indexLocalPath
      );

      // this is the undocumented mechanism of nim-htslib to have a path that also specifies the actual index file
      // toFingerprintString = `${gdsPresignedUrl}##idx##${gdsPresignedUrlBai}`;
      toFingerprintString = `${gdsPresignedUrl}##idx##${indexLocalPath}`;
      break;

    default:
      throw new Error(
        `Url protocol for ${readsUrl} is not one we currently support`
      );
  }

  const execFilePromise = promisify(execFile);

  console.time("somalier");

  // do a somalier extract to generate the fingerprint
  // TODO: send failure events to event bridge?
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
  } finally {
    console.timeEnd("somalier");
  }

  // remove the reads index we downloaded
  await rm(indexLocalPath, { force: true });

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

  // our *last* step is to upload to S3 - if anything above fails we don't want
  // any trace of this fingerprint in the 'done' fingerprints bucket
  const bucketParams: PutObjectCommandInput = {
    Bucket: fingerprintBucketName,
    Key: urlToKey(fingerprintFolder, readsUrl),
    Body: fingerprintData,
    Metadata: {
      // note the key name is lower-cased automatically by AWS
      "fingerprint-created": new Date().toISOString(),
    },
  };

  await s3Client.send(new PutObjectCommand(bucketParams));
}

/**
 * Perform the fingerprint extract for a set of files, according to the
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
