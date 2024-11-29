import { listS3Fingerprints } from "../lib/s3-fingerprint-db/list-s3-fingerprints";
import {
  HG00096_KEY,
  SOME_METADATA_BUT_SUBJECT_KEY,
  NOMETADATA_KEY,
  UNIT_TEST_FINGERPRINT_BUCKET,
  UNIT_TEST_FINGERPRINT_FOLDER,
} from "./aws-test-constants";
import { S3Fingerprint } from "../lib/s3-fingerprint-db/s3-fingerprint";

describe("S3 Fingerprint Database List", () => {
  test("async returning a list of fingerprints", async () => {
    const res: S3Fingerprint[] = [];

    for await (const f of listS3Fingerprints(
      UNIT_TEST_FINGERPRINT_BUCKET,
      UNIT_TEST_FINGERPRINT_FOLDER + "/"
    )) {
      res.push(f);
    }

    expect(res.length).toBe(8);

    // S3 list results are returned in alphabetic order so so are our fingerprints
    expect(res[0].key).toBe(HG00096_KEY);
    expect(res[0].individualId).toBe("HG00096");
    expect(res[0].libraryId).toBe("L654321");

    expect(res[7].key).toBe(
      "fingerprints-for-unit-tests/s3%3A%2F%2Fanother-bucket%2FPTC_ctTSO220404_L2200417.bam.somalier"
    );
    expect(res[7].individualId).toBe("CTDNA");
    expect(res[7].libraryId).toBe("L2200417");
  });

  test("entries with no metadata will work", async () => {
    const res: S3Fingerprint[] = [];

    // this will force just the listing of the single entry we want to inspect
    for await (const f of listS3Fingerprints(
      UNIT_TEST_FINGERPRINT_BUCKET,
      UNIT_TEST_FINGERPRINT_FOLDER + "/"
    )) {
      if (f.key.startsWith(NOMETADATA_KEY)) res.push(f);
    }

    expect(res.length).toBe(1);

    // no metadata and nothing useful in Key means these will be undefined
    expect(res[0].individualId).toBeUndefined();
    expect(res[0].libraryId).toBeUndefined();
  });

  test("entries with some metadata but some filename info will work", async () => {
    const res: S3Fingerprint[] = [];

    for await (const f of listS3Fingerprints(
      UNIT_TEST_FINGERPRINT_BUCKET,
      UNIT_TEST_FINGERPRINT_FOLDER + "/"
    )) {
      if (f.key.startsWith(SOME_METADATA_BUT_SUBJECT_KEY)) res.push(f);
    }

    expect(res.length).toBe(1);

    // no metadata but Key has a subject id will help
    // (library id is actually in metdata)
    expect(res[0].individualId).toBe("SBJ00125");
    expect(res[0].libraryId).toBe("ALIB");
  });
});
