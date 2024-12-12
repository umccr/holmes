#!/usr/bin/env -S npx tsx

import { program } from "commander";
import { S3Fingerprint } from "../artifacts/fingerprint-docker-image/lib/s3-fingerprint-db/s3-fingerprint";
import { listS3Fingerprints } from "../artifacts/fingerprint-docker-image/lib/s3-fingerprint-db/list-s3-fingerprints";
import { headS3Fingerprint } from "../artifacts/fingerprint-docker-image/lib/s3-fingerprint-db/head-s3-fingerprint";
import { urlToKey } from "../artifacts/fingerprint-docker-image/lib/aws-misc";

/**
 * Get all the fingerprints sorted by creation date.
 *
 * @param bucket
 * @param folder
 */
async function getSortedFingerprints(bucket: string, folder: string) {
  const sortedFingerprints: S3Fingerprint[] = [];

  for await (const s3Fingerprint of listS3Fingerprints(bucket, folder, 200)) {
    sortedFingerprints.push(s3Fingerprint);
  }

  // sort by the creation date of the fingerprint
  sortedFingerprints.sort((a, b) => a.created.valueOf() - b.created.valueOf());

  return sortedFingerprints;
}

program
  .name("holmes-admin-cli")
  .description("CLI to administer Holmes fingerprint database")
  .version("1.8.0");

program
  .command("list")
  .description("List all the fingerprints")
  .option("--bucket <bucket>", "fingerprint bucket", "umccr-fingerprint-prod")
  .option("--folder <folder>", "slash terminated folder name", "fingerprints/")
  .action(async (options) => {
    const sortedFingerprints = await getSortedFingerprints(
      options.bucket,
      options.folder
    );

    for (const f of sortedFingerprints)
      console.log(
        `${f.createdMelbourneDisplay}\t${f.url.toString()}\t${
          f.individualId
        }\t${f.libraryId}`
      );
  });

program
  .command("correct")
  .description(
    "Examine every fingerprint record and if needed perform corrections (upgrade old formats etc)"
  )
  .option("--bucket <bucket>", "fingerprint bucket", "umccr-fingerprint-prod")
  .option("--folder <folder>", "slash terminated folder name", "fingerprints/")
  .action(async (options) => {
    const sortedFingerprints = await getSortedFingerprints(
      options.bucket,
      options.folder
    );

    throw new Error("Not implemented");

    for (const f of sortedFingerprints) {
      // detect if correction needed
      // do correction
    }
  });

program
  .command("set")
  .description("Set metadata for an individual fingerprint")
  .argument("<url>", "URL of BAM")
  .option("--bucket <bucket>", "fingerprint bucket", "umccr-fingerprint-prod")
  .option("--folder <folder>", "slash terminated folder name", "fingerprints/")
  .option("--individual-id <ii>", "new individual id")
  .action(async (url: string, options) => {
    console.log(options);
    const f = await headS3Fingerprint(
      options.bucket,
      options.folder,
      urlToKey(options.folder, URL.parse(url))
    );

    if (options.individualId)
      console.log(`set ${f.key} to ${options.individualId}`);

    // bucket = "umccr-fingerprint-prod"
    // key = "fingerprints/s3%3A%2F%2Fanother-bucket%2FPTC_TsqN200511_N.bam.somalier"
    //
    // k = client.head_object(Bucket=bucket, Key=key)
    //
    // m = k["Metadata"]
    //
    // print(m)
    //
    // if "library-identifier" in m:
    //     m["library-id"] = m["library-identifier"]
    //     del m["library-identifier"]
    //
    // if "subject-identifier" in m:
    //     m["individual-id"] = m["subject-identifier"]
    //     del m["subject-identifier"]
    //
    // client.copy_object(Bucket=bucket, Key=key, CopySource=bucket + '/' + key, Metadata=m, ContentType=k['ContentType'], MetadataDirective='REPLACE')
  });

program.parse();
