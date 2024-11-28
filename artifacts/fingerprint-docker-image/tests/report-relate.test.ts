import { readFile } from "fs/promises";
import { reportRelate } from "../lib/report-relate";
import { SAMPLE_PAIRS_PATH, SAMPLE_SAMPLES_PATH } from "./sample";

describe("Report Relate", () => {
  it("basic report", async () => {
    const samplesTsv = await readFile(SAMPLE_SAMPLES_PATH, "utf8");
    const pairsTsv = await readFile(SAMPLE_PAIRS_PATH, "utf8");

    console.debug(await reportRelate(samplesTsv, pairsTsv));
  });
});
