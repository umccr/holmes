import axios from "axios";
import {
  _Object,
  ListObjectsV2Command,
  ListObjectsV2Output,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  keyToUrl,
  s3Download,
  s3ListAllFingerprintFiles,
  urlToKey,
} from "./aws";
import { GdsFile, gdsFileSearchInVolume } from "./illumina-icav1";
import { chunk } from "./misc";
import {
  fingerprintBucketName,
  somalierSites,
  somalierSitesBucketKey,
  somalierSitesBucketName,
} from "./env";

type EventInput = {
  gdsVolumes: string[];
  gdsFileWildcard: string;
  chunkSize: number;

  devMaxGdsFiles?: number;
};

/**
 * A lambda function that scans
 * @param ev
 * @param context
 */
export const lambdaHandler = async (ev: EventInput, context: any) => {
  if (!fingerprintBucketName)
    throw new Error(
      "A finger print bucket name must be defined as part of the stack"
    );

  const sitesChecksum = await s3Download(
    somalierSitesBucketName,
    somalierSitesBucketKey,
    somalierSites,
    true
  );

  if (!sitesChecksum)
    throw new Error("A sites file must be defined as part of the stack");

  const fingerPrintEntries: { [index: string]: _Object } = {};

  for await (const s3Object of s3ListAllFingerprintFiles(
    fingerprintBucketName,
    sitesChecksum
  )) {
    fingerPrintEntries[keyToUrl(sitesChecksum, s3Object.Key!).toString()] =
      s3Object;
  }

  // make a dictionary of all the gds files and their GDS entries keyed by GDS url
  const gdsEntries: { [index: string]: GdsFile } = {};

  for (const vol of ev.gdsVolumes || []) {
    let found = 0;
    for await (const gds of gdsFileSearchInVolume(
      vol,
      "",
      ev.gdsFileWildcard
    )) {
      gdsEntries[`gds://${gds.volumeName}${gds.path}`] = gds;

      found++;

      if (found % 50 == 0) console.log(`Currently discovered ${found} BAMs`);

      // for debug/dev purposes it is useful to be able to limit the scope of the
      // (long) recursive GDS search
      if (ev.devMaxGdsFiles) if (found > ev.devMaxGdsFiles) break;
    }
  }

  const needsFingerprintingSet = new Set<string>();
  const hasFingerprintingSet = new Set<string>();

  for (const [gdsUrl, gds] of Object.entries(gdsEntries)) {
    if (gdsUrl in fingerPrintEntries) {
      // we also have to check the modifications times - to ensure that our fingerprint is dated after the BAM
      const gdsModified = new Date(gds.timeModified);

      if (gdsModified > fingerPrintEntries[gdsUrl].LastModified!)
        needsFingerprintingSet.add(gdsUrl);
      else hasFingerprintingSet.add(gdsUrl);
    } else {
      needsFingerprintingSet.add(gdsUrl);
    }
  }

  return {
    needsFingerprinting: chunk(
      Array.from(needsFingerprintingSet.values()),
      ev.chunkSize
    ),
    hasFingerprinting: chunk(
      Array.from(hasFingerprintingSet.values()),
      ev.chunkSize
    ),
  };
};
