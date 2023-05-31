import { join } from "path";
import { readFile } from "fs/promises";
import { reportRelate } from "../lib/report-relate";

const SAMPLE_PAIRS_PATH = join(__dirname, "sample-pairs.tsv");
const SAMPLE_SAMPLES_PATH = join(__dirname, "sample-samples.tsv");

describe("Report Relate", () => {
  it("basic report", async () => {
    const samplesTsv = await readFile(SAMPLE_SAMPLES_PATH, "utf8");
    const pairsTsv = await readFile(SAMPLE_PAIRS_PATH, "utf8");

    console.debug(await reportRelate(samplesTsv, pairsTsv));
  });
});
