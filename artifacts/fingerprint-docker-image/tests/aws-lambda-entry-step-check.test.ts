import { lambdaHandler } from "../lambda-entry-step-check";

import {
  HG002_KEY,
  HG002_URL,
  HG003_KEY,
  HG003_URL,
  HG004_KEY,
  HG004_URL,
  HG00096_KEY,
  HG00096_URL,
  UNIT_TEST_FINGERPRINT_FOLDER,
} from "./aws-test-constants";

describe("Fingerprint check operation in AWS", () => {
  beforeEach(() => {});

  it("basic check of an unrelated fingerprint against others including itself", async () => {
    const r = await lambdaHandler(
      {
        BatchInput: {
          indexes: [HG00096_URL],
          fingerprintFolder: `${UNIT_TEST_FINGERPRINT_FOLDER}/`,
          relatednessThreshold: 0.8,
          minimumNCount: 5,
          excludeRegex: "",
        },
        Items: [
          {
            Key: HG002_KEY,
            LastModified: 1,
            Size: 1,
          },
          {
            Key: HG003_KEY,
            LastModified: 1,
            Size: 1,
          },
          {
            Key: HG00096_KEY,
            LastModified: 1,
            Size: 1,
          },
          {
            Key: HG004_KEY,
            LastModified: 1,
            Size: 1,
          },
        ],
      },
      {}
    );

    // these are all unrelated samples - the only match will be against itself
    expect(Object.entries(r).length).toBe(1);

    const hg96Matches = r[HG00096_URL];

    expect(hg96Matches).toBeDefined();
    expect(hg96Matches.length).toBe(1);

    const hg96Self = hg96Matches[0];

    expect(hg96Self).toBeDefined();
    expect(hg96Self.file).toBe(HG00096_URL);
    expect(hg96Self.type).toBe("Self");
    expect(hg96Self.relatedness).toBe(1);
    expect(hg96Self.n).toBe(16209);
  });

  it("basic check of an fingerprint against other related humans", async () => {
    const r = await lambdaHandler(
      {
        BatchInput: {
          indexes: [HG002_URL],
          fingerprintFolder: `${UNIT_TEST_FINGERPRINT_FOLDER}/`,
          // this is deliberately low enough to detect family relations - which we normally do not do
          // but it will exhibit matches for our test purposes
          relatednessThreshold: 0.4,
          minimumNCount: 5,
          excludeRegex: "",
        },
        Items: [
          {
            Key: HG003_KEY,
            LastModified: 1,
            Size: 1,
          },
          {
            Key: HG004_KEY,
            LastModified: 1,
            Size: 1,
          },
        ],
      },
      {}
    );

    console.log(r);

    const hg2Matches = r[HG002_URL];

    expect(hg2Matches).toBeDefined();
    expect(hg2Matches.length).toBe(2);

    const hg3 = hg2Matches.find((a) => a.file === HG003_URL);
    const hg4 = hg2Matches.find((a) => a.file === HG004_URL);

    expect(hg3).toBeDefined();
    // stupid typescript workaround
    if (!hg3) fail();

    expect(hg3.type).toBe("UnexpectedRelated");

    // the definition of "Correct" here is basically whatever somalier outputs - but I've put in all
    // these assertions to prevent regressions like renaming a CSV field in somalier and the value disappearing etc
    expect(hg3.relatedness).toBe(0.484);
    expect(hg3.ibs0).toBe(0);
    expect(hg3.ibs2).toBe(371);
    expect(hg3.hom_concordance).toBe(0.673);
    expect(hg3.hets_a).toBe(217);
    expect(hg3.hets_b).toBe(2134);
    expect(hg3.hets_ab).toBe(417);
    expect(hg3.shared_hets).toBe(101);
    expect(hg3.hom_alts_a).toBe(214);
    expect(hg3.hom_alts_b).toBe(1927);
    expect(hg3.shared_hom_alts).toBe(144);
    expect(hg3.n).toBe(586);
    expect(hg3.x_ibs0).toBe(0);
    expect(hg3.x_ibs2).toBe(0);

    expect(hg4).toBeDefined();
    // stupid typescript workaround
    if (!hg4) fail();
    expect(hg4.type).toBe("UnexpectedRelated");
  });

  it("check where the indexes are the only fingerprints we end up comparing against", async () => {
    const r = await lambdaHandler(
      {
        BatchInput: {
          indexes: [HG00096_URL],
          fingerprintFolder: `${UNIT_TEST_FINGERPRINT_FOLDER}/`,
          relatednessThreshold: 0.8,
          minimumNCount: 5,
          // note this is set to exclude all the items passed in
          // we want to simulate when this happens (given the way steps divides up the BAMs means that this
          // can definitely (and has) occurred)
          excludeRegex: ".*HG.*",
        },
        Items: [
          {
            Key: HG00096_KEY,
            LastModified: 1,
            Size: 1,
          },
          {
            Key: HG002_KEY,
            LastModified: 1,
            Size: 1,
          },
        ],
      },
      {}
    );

    expect(Object.entries(r).length).toBe(1);
    expect(r[HG00096_URL]).toBeDefined();
    expect(r[HG00096_URL].length).toBe(0);
  });
});
