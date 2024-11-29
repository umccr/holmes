import { downloadReferenceData } from "../lib/download-reference-data";
import { stat } from "node:fs/promises";

describe("Fingerprint download reference data in AWS", () => {
  test("basic check that files are downloaded for a given reference", async () => {
    const [sitesLocal, fastaLocal, fastaIndexLocal] =
      await downloadReferenceData("hg38.rna");

    const stats = await stat(sitesLocal);

    expect(stats.size).toBe(266638);
    expect(stats.isFile()).toBe(true);
  });

  test("unknown reference throws an exception", async () => {
    await expect(downloadReferenceData("hg99.rna")).rejects.toThrow(
      "reference hg99.rna"
    );
  });
});
