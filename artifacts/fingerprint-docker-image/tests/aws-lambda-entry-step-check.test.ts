import { lambdaHandler } from "../lambda-entry-step-check";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("Fingerprint check operation in AWS", () => {
  beforeEach(() => {});

  it("basic check of an unrelated fingerprint against others including itself", async () => {
    const r = await lambdaHandler(
      {
        BatchInput: {
          indexes: ["s3://a-bucket/HG00096.bam"],
          fingerprintFolder: "fingerprints-for-unit-tests/",
          relatednessThreshold: 0.8,
          minimumNCount: 5,
          excludeRegex: "",
        },
        Items: [
          {
            Key: "fingerprints-for-unit-tests/s3%3A%2F%2Fa-bucket%2FHG002-ready.bam.somalier",
            LastModified: 1,
            Size: 1,
          },
          {
            Key: "fingerprints-for-unit-tests/s3%3A%2F%2Fa-bucket%2FHG003-ready.bam.somalier",
            LastModified: 1,
            Size: 1,
          },
          {
            Key: "fingerprints-for-unit-tests/s3%3A%2F%2Fa-bucket%2FHG00096.bam.somalier",
            LastModified: 1,
            Size: 1,
          },
          {
            Key: "fingerprints-for-unit-tests/s3%3A%2F%2Fa-bucket%2FHG004-ready.bam.somalier",
            LastModified: 1,
            Size: 1,
          },
        ],
      },
      {}
    );
  });
});
