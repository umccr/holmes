import { readFile } from "fs/promises";
import { reportRelate } from "../lib/report-relate";
import { SAMPLE_PAIRS_PATH, SAMPLE_SAMPLES_PATH } from "./sample";
import { UNIT_TEST_FINGERPRINT_BUCKET } from "./aws-test-constants";

describe("Report Relate", () => {
  it("basic report", async () => {
    const samplesTsv = await readFile(SAMPLE_SAMPLES_PATH, "utf8");
    const pairsTsv = await readFile(SAMPLE_PAIRS_PATH, "utf8");

    console.debug(
      await reportRelate(
        samplesTsv,
        pairsTsv,
        UNIT_TEST_FINGERPRINT_BUCKET,
        UNIT_TEST_FINGERPRINT_BUCKET + "/"
      )
    );
  });
});
