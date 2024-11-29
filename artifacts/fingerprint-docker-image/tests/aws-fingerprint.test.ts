import { downloadAndCorrectFingerprint } from "../lib/fingerprint-download";
import {
  SOME_METADATA_BUT_SUBJECT_KEY,
  SOME_METADATA_BUT_SUBJECT_URL,
  PTC_CTTSO_KEY,
  PTC_CTTSO_URL,
  UNIT_TEST_FINGERPRINT_FOLDER,
} from "./aws-test-constants";

describe("Fingerprints in AWS", () => {
  it("can read a fingerprint and return metadata", async () => {
    const r = await downloadAndCorrectFingerprint(
      UNIT_TEST_FINGERPRINT_FOLDER + "/",
      PTC_CTTSO_KEY,
      PTC_CTTSO_URL,
      5
    );

    expect(r.generatedSampleId).toBe("000000000000000000000005");
    expect(r.individualId).toBe("CTDNA");

    expect(r.created).toBeDefined();
    expect(r.created!.getUTCFullYear()).toBe(2024);
    expect(r.created!.getUTCMonth()).toBe(10);
    expect(r.created!.getUTCDate()).toBe(25);
    expect(r.created!.getUTCHours()).toBe(4);
    expect(r.created!.getUTCMinutes()).toBe(0);
    expect(r.created!.getUTCSeconds()).toBe(7);
  });

  it("can handle a fingerprint with limited metadata", async () => {
    // this fingerprint is deliberately set to be missing created date and subject identifier
    // IT DOES HOWEVER HAVE A LIBRARY IDENTIFIER (so it has _some_ metadata)
    const r = await downloadAndCorrectFingerprint(
      UNIT_TEST_FINGERPRINT_FOLDER + "/",
      SOME_METADATA_BUT_SUBJECT_KEY,
      SOME_METADATA_BUT_SUBJECT_URL,
      2
    );

    expect(r.generatedSampleId).toBe("0000002");
    expect(r.individualId).toBe("SBJ00125");
    expect(r.libraryId).toBe("ALIB");

    // the created date should come from the underlying S3 LastModified but let's not
    // assert a value as it might change as we edit the fingerprint
    expect(r.created).toBeDefined();
  });
});
