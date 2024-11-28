import { readFile } from "fs/promises";
import { reportControl } from "../lib/report-control";
import { SAMPLE_PAIRS_PATH, SAMPLE_SAMPLES_PATH } from "./sample";

describe("Report Control", () => {
  it("basic report", async () => {
    const samplesTsv = await readFile(SAMPLE_SAMPLES_PATH, "utf8");
    const pairsTsv = await readFile(SAMPLE_PAIRS_PATH, "utf8");

    console.debug(await reportControl("0000000", samplesTsv, pairsTsv));
  });
});
