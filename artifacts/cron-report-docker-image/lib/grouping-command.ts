import { _Object } from "@aws-sdk/client-s3";
import { format, isSameDay, max, subDays } from "date-fns";
import {
  bucketKeyToUrl,
  findCheck,
  findCheckLarge,
  s3ListAllFingerprintFiles,
} from "./common";
import {
  analyseRelatednessOfBams,
  getBamRelatedGraphs,
} from "./analyse-relatedness-of-bams";

/**
 * A command to print to slack information about the grouping of a batch of sequencing.
 *
 * @param bucket the bucket where fingerprints and config are stored
 * @param fingerprintFolder the folder (key with trailing slash) that has the actual fingerprints
 * @param slackSend a method for sending messages to Slack
 * @param relatedness the relatedness range
 * @param expectRelatedRegex regex for file names that *should* be related
 * @param days either the number of days to go back in time, a specific Date, or undefined (means pick last valid date)
 */
export async function groupingCommand(
  bucket: string,
  fingerprintFolder: string,
  slackSend: (slackMessage: any) => Promise<void>,
  relatedness: number,
  expectRelatedRegex: RegExp,
  days?: number | Date
) {
  // any error that we experience from here will be logged to Slack
  try {
    // service discover the steps bits of holmes
    const checkStepsArn = await findCheck();
    const checkLargeStepsArn = await findCheckLarge();

    // find all the fingerprints present
    const allFingerprints: _Object[] = [];
    for await (const i of s3ListAllFingerprintFiles(bucket, fingerprintFolder))
      allFingerprints.push(i);

    // from all the fingerprints we are going to identify a set from a single day
    const urls: string[] = [];
    let batchDate;

    if (days instanceof Date) {
      batchDate = days;
      console.log(
        `We were instructed to use the specific date ${batchDate}, so we are processing that day as a batch`
      );
    } else if (days && Number.isSafeInteger(days)) {
      batchDate = subDays(new Date(), days);
      console.log(
        `We were instructed to go back ${days} days which is ${batchDate}, so we are processing that day as a batch`
      );
    } else {
      batchDate = max(allFingerprints.map((c) => c.LastModified!));
      console.log(
        `The latest date of any fingerprint is ${batchDate}, so we are processing that day as a batch`
      );
    }

    for (const c of allFingerprints) {
      if (isSameDay(c.LastModified!, batchDate)) {
        const url = bucketKeyToUrl(fingerprintFolder, c.Key!);

        // skip folder entries
        if (url.trim().length == 0) continue;

        // skip PTC and NTC for the moment
        if (url.includes("PTC_") || url.includes("NTC_")) {
          console.log(`Skipping sample ${url}`);
        } else {
          console.log(`${url}`);
          urls.push(url);
        }
      }
    }

    const slackRunWeLookedFor = `For sequencing runs that finished fingerprinting in \`${bucket}/${fingerprintFolder}\` on ${format(
      batchDate,
      "PPPP"
    )}`;
    const slackSettingsWeUsed = `We looked for samples with relatedness threshold > ${relatedness} and where expected relatedness was defined by ${expectRelatedRegex}`;

    // if there is nothing to even look at - we message in the simplest way
    if (urls.length === 0) {
      await slackSend({
        text: `${slackRunWeLookedFor}\nWe found no new fingerprints and so no checks were run`,
      });

      return;
    }

    const x = await getBamRelatedGraphs(
      checkLargeStepsArn,
      fingerprintFolder,
      urls,
      relatedness,
      expectRelatedRegex
    );

    // do the fingerprinting and establish any groups
    const groups = await analyseRelatednessOfBams(
      urls,
      relatedness,
      fingerprintFolder,
      checkStepsArn,
      expectRelatedRegex.toString()
    );

    // we have run the fingerprinting - now report back via slack
    let gCount = 1;
    let uuCount = 1;

    // construct the 'expected' text - no highlighting, low key info
    {
      let expectedText = `${slackRunWeLookedFor} we found ${urls.length} new fingerprints\n${slackSettingsWeUsed}\n`;

      const expectedUnrelatedSubjectsText = groups.expectedUnrelatedSubjectIds
        .map((s) => `\`${s}\``)
        .sort()
        .join(", ");

      if (expectedUnrelatedSubjectsText.length > 0)
        expectedText += `New expected unrelated (by subject id) = ${expectedUnrelatedSubjectsText}\n`;

      const expectedRelatedSubjectsText = Object.values(
        groups.expectedRelatedGroups
      )
        .map((okg) => `\`${okg.subjectId}\` x${okg.count}`)
        .sort()
        .join(", ");

      if (expectedRelatedSubjectsText.length > 0)
        expectedText += `New expected related (by subject id x count) = ${expectedRelatedSubjectsText}\n`;

      await slackSend({
        text: expectedText,
      });
    }

    for (const [
      subjectUnexpectedUnrelated,
      filesUnexpectedUnrelated,
    ] of Object.entries(groups.unexpectedUnrelatedGroups)) {
      let newTxt = `*Unexpected Unrelated Group ${uuCount++}* for *${subjectUnexpectedUnrelated}* (_these filenames seem to be the same subject but somalier said they weren't related_)\n`;
      for (const f of filesUnexpectedUnrelated) {
        newTxt = newTxt + `\`${f}\`\n`;
      }

      await slackSend({
        text: newTxt,
      });
    }

    // samples the were grouped but unexpected
    for (const g of groups.unexpectedRelatedGroups) {
      let newTxt = `*Unexpected Related Group ${gCount++}* (_somalier said these were related genomes but their filenames would indicate otherwise_)\n`;
      for (const [k, v] of g.entries()) {
        newTxt =
          newTxt +
          `\`${k}\` subj=${v.subject} lib=${v.library} r=${v.relatedness} n=${v.n} shared hets=${v.shared_hets} shared hom alts=${v.shared_hom_alts} base=${v.base}\n`;
      }

      await slackSend({
        text: newTxt,
      });
    }
  } catch (error: any) {
    console.log(error);

    await slackSend({
      text: error.toString(),
    });
  }
}
