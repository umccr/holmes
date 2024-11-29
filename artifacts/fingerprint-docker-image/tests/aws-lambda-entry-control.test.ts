import { lambdaHandler } from "../entry/lambda-entry-control";

import {
  HG002_URL,
  UNIT_TEST_FINGERPRINT_FOLDER,
  UNIT_TEST_SLACK_CHANNEL,
} from "./aws-test-constants";

describe("Fingerprint control in AWS", () => {
  test("basic check of a sample against controls", async () => {
    const r = await lambdaHandler(
      {
        index: HG002_URL,
        fingerprintFolder: `${UNIT_TEST_FINGERPRINT_FOLDER}/`,
      },
      {}
    );

    // assert the basic shape of the Pairs file - though noting that somalier can process the
    // fingerprint files in different orders so we have to be able to handle that
    {
      const lines = r.samplesTsv.split("\n");
      expect(
        lines[0].startsWith(
          "#family_id\tsample_id\tpaternal_id\tmaternal_id\tsex\tphenotype"
        )
      ).toBeTruthy();

      let matchCount = 0;
      for (const l of lines.slice(1)) {
        if (l.startsWith("00000000000101\tNA24385")) {
          expect(l).toBe(
            "00000000000101\tNA24385\t-9\t-9\t-9\t-9\t-9\t16.2\t4.3\t16.0\t4.5\t0.51\t0.43\t4533\t5520\t5377\t1039\t0.005\t9.40\t520\t273\t0\t247\t8.50\t2"
          );
          matchCount++;
        }
        if (l.startsWith(`00001\t${HG002_URL}`)) {
          expect(l).toBe(
            `00001\t${HG002_URL}\t-9\t-9\t-9\t-9\t-9\t131.4\t100.5\t5.1\t32.1\t0.43\t0.53\t188\t217\t214\t15850\t0.000\t0.00\t0\t0\t0\t0\t0.00\t0`
          );
          matchCount++;
        }
        if (l.startsWith("0000100\tNA12878")) {
          expect(l).toBe(
            "0000100\tNA12878\t-9\t-9\t-9\t-9\t-9\t35.3\t7.3\t35.3\t7.3\t0.53\t0.40\t4581\t6122\t5471\t295\t0.008\t33.60\t774\t299\t182\t293\t0.00\t0"
          );
          matchCount++;
        }
      }

      expect(matchCount).toBe(3);
    }

    // assert the basic shape of the Pairs file - though noting that somalier can process the
    // fingerprint files in different orders so we have to be able to handle that
    {
      const lines = r.pairsTsv.split("\n");
      expect(
        lines[0].startsWith("#sample_a\tsample_b\trelatedness\tibs0\tibs2")
      ).toBeTruthy();

      let matchCount = 0;
      for (const l of lines.slice(1)) {
        if (l.startsWith(`NA24385\t${HG002_URL}`)) {
          expect(l).toBe(
            "NA24385\ts3://a-bucket/HG002-ready.bam\t1.000\t0\t588\t0.981\t5520\t217\t390\t195\t5377\t214\t210\t588\t0\t0\t-1.0"
          );
          matchCount++;
        }
        if (l.startsWith("NA24385\tNA12878")) {
          expect(l).toBe(
            "NA24385\tNA12878\t-0.073\t1327\t7199\t0.023\t5520\t6122\t11134\t2245\t5377\t5471\t2778\t15170\t59\t344\t-1.0"
          );
          matchCount++;
        }
        if (l.startsWith(`${HG002_URL}\tNA12878`)) {
          expect(l).toBe(
            "s3://a-bucket/HG002-ready.bam\tNA12878\t-0.091\t58\t304\t-0.014\t217\t6122\t440\t96\t214\t5471\t113\t610\t0\t0\t-1.0"
          );
          matchCount++;
        }
      }

      expect(matchCount).toBe(3);
    }
  });

  xtest("send a report to Slack", async () => {
    const r = await lambdaHandler(
      {
        index: HG002_URL,
        fingerprintFolder: `${UNIT_TEST_FINGERPRINT_FOLDER}/`,
        channelId: UNIT_TEST_SLACK_CHANNEL,
      },
      {}
    );
  });
});
