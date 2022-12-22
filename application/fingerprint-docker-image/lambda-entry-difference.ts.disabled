import { _Object } from "@aws-sdk/client-s3";
import { keyToUrl, s3Download, s3ListAllFingerprintFiles } from "./lib/aws";
import { GdsFile, gdsFileSearchInVolume } from "./lib/illumina-icav1";
import { chunk } from "./lib/misc";
import {
  fingerprintBucketName,
  safeGetSourcesAndLimits,
  somalierSites,
  somalierSitesBucketKey,
  somalierSitesBucketName,
} from "./lib/env";

type EventInput = {
  // the size we want to chunk the output URLs into (defaults to 5)
  devChunkSize?: number;
  // a limit to the number of files we want to discover before exiting for dev/test scenarios
  devMaxGdsFiles?: number;
};

/**
 * A lambda function that scans GDS roots and collects all the files matching
 * a file pattern (*.bam). We then cross check those files against our known
 * fingerprints to sort into which files need fingerprinting - and which already
 * have fingerprints.
 *
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
  let foundCount = 0;

  const [sources, limits] = safeGetSourcesAndLimits();

  for (const root of sources) {
    const rootUrl = new URL(root);

    if (rootUrl.protocol === "gds:") {
      // the path prefix will have /* attached as part of the search so we ensure that if already
      // present in the URL path we remove it
      let rootPathPrefix = rootUrl.pathname;

      if (rootPathPrefix.endsWith("/*"))
        rootPathPrefix = rootPathPrefix.slice(0, -2);
      else if (rootPathPrefix.endsWith("/"))
        rootPathPrefix = rootPathPrefix.slice(0, -1);

      // for the actual raw GDS search we are going to look for both BAM and BAIs - and later will restrict
      // back to only BAMs
      for await (const foundGdsFile of gdsFileSearchInVolume(
        rootUrl.hostname,
        rootPathPrefix,
        "*.ba?"
      )) {
        gdsEntries[`gds://${foundGdsFile.volumeName}${foundGdsFile.path}`] =
          foundGdsFile;

        foundCount++;

        if (foundCount % 50 == 0)
          console.log(`Currently discovered ${foundCount} BA?s`);

        // for debug/dev purposes it is useful to be able to limit the scope of the
        // (long) recursive GDS search
        if (ev.devMaxGdsFiles) if (foundCount > ev.devMaxGdsFiles) break;
      }
    } else {
      throw new Error(`Unknown protocol for root entry ${root}`);
    }
  }

  const needsFingerprintingSet = new Set<string>();
  const hasFingerprintingSet = new Set<string>();

  for (const [gdsUrl, gds] of Object.entries(gdsEntries)) {
    // we want to determine here is we should skip this entry entirely

    // bai files we only capture so we can do some checking - we NEVER want to fingerprint the bai
    if (gdsUrl.endsWith(".bai")) continue;

    // if somehow we got a .BAT file or someting we definitely never want to fingerprint
    if (!gdsUrl.endsWith(".bam")) continue;

    const bai = gdsUrl + ".bai";

    // we can't process BAMs if they aren't indexed - it generally means that are temporary artifacts anyhow
    if (!(bai in gdsEntries)) continue;

    // if the url doesn't contain at least one Limit string then we don't want it either
    let foundLimit = false;

    for (const l of limits) {
      if (gdsUrl.includes(l)) foundLimit = true;
    }

    if (!foundLimit) continue;

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
      ev.devChunkSize || 5
    ),
    hasFingerprinting: Array.from(hasFingerprintingSet.values()),
  };
};
