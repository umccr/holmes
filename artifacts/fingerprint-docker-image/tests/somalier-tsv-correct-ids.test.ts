import { join } from "path";
import { somalierTsvCorrectIds } from "../lib/somalier-tsv-correct-ids";
import { readFile } from "fs/promises";
import { FingerprintDownloaded } from "../lib/aws-fingerprint";

const SAMPLE_PAIRS_PATH = join(__dirname, "sample-pairs.tsv");
const SAMPLE_SAMPLES_PATH = join(__dirname, "sample-samples.tsv");

const idMap: Record<string, FingerprintDownloaded> = {
  "0000000": {
    fingerprintKey: "gds://bucket/my-zzz.bam",
    generatedSampleId: "0000000",
    generatedPath: "/tmp/0.somalier",
  },
  "0000001": {
    fingerprintKey: "gds://bucket/my-aaa.bam",
    generatedSampleId: "0000001",
    generatedPath: "/tmp/1.somalier",
  },
  "0000002": {
    fingerprintKey: "gds://bucket/my-bbb.bam",
    generatedSampleId: "0000002",
    generatedPath: "/tmp/2.somalier",
  },
  "0000003": {
    fingerprintKey: "gds://bucket/my-ccc.bam",
    generatedSampleId: "0000003",
    generatedPath: "/tmp/3.somalier",
  },
  "0000004": {
    fingerprintKey: "gds://bucket/my-ddd.bam",
    generatedSampleId: "0000004",
    generatedPath: "/tmp/4.somalier",
  },
  "0000005": {
    fingerprintKey: "gds://bucket/my-eee.bam",
    generatedSampleId: "0000005",
    generatedPath: "/tmp/5.somalier",
  },
};

describe("Parse in TSVs and correct the sample ids", () => {
  it("pairs tsv", async () => {
    const pairsTsv = await readFile(SAMPLE_PAIRS_PATH, "utf8");

    const result = await somalierTsvCorrectIds(idMap, pairsTsv, [0, 1]);

    const resultLines = result.split("\n");

    expect(
      resultLines[0].startsWith("#sample_a\tsample_b\trelatedness\tibs0")
    ).toBeTruthy();
    expect(
      resultLines[1].startsWith(
        "gds://bucket/my-zzz.bam\tgds://bucket/my-aaa.bam\t-0.008"
      )
    ).toBeTruthy();

    console.debug(result);

    expect(resultLines).toHaveLength(17);
  });

  it("samples tsv", async () => {
    const samplesTsv = await readFile(SAMPLE_SAMPLES_PATH, "utf8");

    const result = await somalierTsvCorrectIds(idMap, samplesTsv, [1]);

    const resultLines = result.split("\n");

    expect(
      resultLines[0].startsWith("#family_id\tsample_id\tpaternal_id")
    ).toBeTruthy();
    expect(
      resultLines[1].startsWith("0000000\tgds://bucket/my-zzz.bam\t-9")
    ).toBeTruthy();

    expect(resultLines).toHaveLength(8);
  });
});
