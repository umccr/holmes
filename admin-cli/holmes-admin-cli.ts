#!/usr/bin/env -S npx tsx

import { listS3Fingerprints } from "../artifacts/fingerprint-docker-image/lib/s3-fingerprint-db/list-s3-fingerprints";
import { program } from "commander";
import { S3Fingerprint } from "../artifacts/fingerprint-docker-image/lib/s3-fingerprint-db/s3-fingerprint";

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

    for (const f of sortedFingerprints) {
      // detect if correction needed
      // do correction
    }
  });

program.parse();
