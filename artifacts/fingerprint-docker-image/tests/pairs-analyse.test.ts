import { pairsAnalyse } from "../lib/somalier-pairs-analyse";
import { createReadStream } from "fs";
import { urlToKey } from "../lib/aws";
import { join } from "path";

const FING_FOLDER = "fing/";

const SAMPLE_PAIRS_PATH = join(__dirname, "sample-pairs.tsv");

// the sample pairs has the following notable relationships (all faked directly in the data - makes no sense bioinformatically)
// 0 -> 4 (rel=0.812 n=16179)
// 0 -> 5 (rel=0.935 n=16219)
// 1 -> 2 (rel=0.888 n=20)
// 1 -> 4 (rel=1 n=16162)
// 4 -> 5 (rel=1 n=16150)

const index0 = "s3://subject_AAAA.bam";
const index1 = "s3://subject_BBBB.bam";
const index2 = "s3://another_subject_BBBB.bam";
const index3 = "s3://another_subject_AAAA.bam";
const index4 = "s3://yet_another_subject_BBBB.bam";
const index5 = "s3://subject_FFFF.bam";

describe("Run pairing analysis", () => {
  it("Test direct somalier relationships are reported as Unexpected Related when no regexp", async () => {
    const matches = await pairsAnalyse(
      () => createReadStream(SAMPLE_PAIRS_PATH),
      FING_FOLDER,
      {
        "0000000": urlToKey(FING_FOLDER, new URL(index0)),
      },
      {
        "0000001": urlToKey(FING_FOLDER, new URL(index1)),
        "0000002": urlToKey(FING_FOLDER, new URL(index2)),
        "0000003": urlToKey(FING_FOLDER, new URL(index3)),
        "0000004": urlToKey(FING_FOLDER, new URL(index4)),
        "0000005": urlToKey(FING_FOLDER, new URL(index5)),
      },
      0.8,
      50,
      /^\\b$/
    );

    expect(matches).toBeTruthy();

    const keys = Object.keys(matches);

    // we should note
    // we DO NOT GET BACK 1 -> 2 (N too low)
    // we DO NOT GET BACK 4 -> 5 (never reports sample -> sample)

    // because our regexp has no chance of matching - this purely reports out from index -> sample > threshold and minimum N
    expect(keys).toHaveLength(1);

    const matches0 = matches[index0].sort(
      (a, b) => b.relatedness - a.relatedness
    );

    expect(matches0).toHaveLength(2);

    {
      const matches00 = matches0[0];

      expect(matches00).toBeTruthy();
      expect(matches00.type).toBe("UnexpectedRelated");
      expect(matches00.relatedness).toBe(0.935);
      expect(matches00.n).toBe(16219);
      expect(matches00.file).toBe(index5);
      expect(matches00.regexJson).toBe("{}");
    }

    {
      const matches01 = matches0[1];

      expect(matches01).toBeTruthy();
      expect(matches01.type).toBe("UnexpectedRelated");
      expect(matches01.relatedness).toBe(0.812);
      expect(matches01.file).toBe(index4);
      expect(matches01.regexJson).toBe("{}");
    }
  });

  it("Test relationships are found with regexp", async () => {
    const matches = await pairsAnalyse(
      () => createReadStream(SAMPLE_PAIRS_PATH),
      FING_FOLDER,
      {
        "0000000": urlToKey(FING_FOLDER, new URL(index0)),
        "0000001": urlToKey(FING_FOLDER, new URL(index1)),
      },
      {
        "0000002": urlToKey(FING_FOLDER, new URL(index2)),
        "0000003": urlToKey(FING_FOLDER, new URL(index3)),
        "0000004": urlToKey(FING_FOLDER, new URL(index4)),
        "0000005": urlToKey(FING_FOLDER, new URL(index5)),
      },
      0.9,
      50,
      /^.*(subject_....).*$/
    );

    expect(matches).toBeTruthy();

    const keys = Object.keys(matches);

    expect(keys).toHaveLength(2);

    const matches0 = matches[index0].sort(
      (a, b) => b.relatedness - a.relatedness
    );
    const matches1 = matches[index1].sort(
      (a, b) => b.relatedness - a.relatedness
    );

    expect(matches0).toHaveLength(2);
    expect(matches1).toHaveLength(2);

    {
      const matches00 = matches0[0];

      expect(matches00).toBeTruthy();
      expect(matches00.type).toBe("UnexpectedRelated");
      expect(matches00.relatedness).toBe(0.935);
      expect(matches00.n).toBe(16219);
      expect(matches00.file).toBe(index5);
      expect(matches00.regexJson).toBe(
        '{"index":["subject_AAAA"],"sample":["subject_FFFF"]}'
      );
    }

    {
      const matches01 = matches0[1];

      expect(matches01).toBeTruthy();
      expect(matches01.type).toBe("UnexpectedUnrelated");
      expect(matches01.relatedness).toBe(-0.111);
      expect(matches01.file).toBe(index3);
      expect(matches01.regexJson).toBe(
        '{"index":["subject_AAAA"],"sample":["subject_AAAA"]}'
      );
    }

    {
      const matches10 = matches1[0];

      expect(matches10).toBeTruthy();
      expect(matches10.type).toBe("ExpectedRelated");
      expect(matches10.relatedness).toBe(1);
      expect(matches10.n).toBe(16162);
      expect(matches10.file).toBe(index4);
      expect(matches10.regexJson).toBe(
        '{"index":["subject_BBBB"],"sample":["subject_BBBB"]}'
      );
    }

    {
      const matches11 = matches1[1];

      expect(matches11).toBeTruthy();
      expect(matches11.type).toBe("UnexpectedUnrelated");
      expect(matches11.relatedness).toBe(0.888);
      expect(matches11.file).toBe(index2);
      expect(matches11.regexJson).toBe(
        '{"index":["subject_BBBB"],"sample":["subject_BBBB"]}'
      );
    }
  });
});
