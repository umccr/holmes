import { downloadAndCorrectFingerprint } from "../lib/aws-fingerprint";

describe("Fingerprints in AWS", () => {
  it("can read a fingerprint and return metadata", async () => {
    const r = await downloadAndCorrectFingerprint(
      "fingerprints-for-unit-tests/s3%3A%2F%2Fumccr-fingerprint-local-dev-test%2Ftest-bams%2Fctdna%2FPTC_ctTSO220404_L2200417.bam.somalier",
      "s3://blah",
      5
    );

    expect(r.generatedSampleId).toBe("000000000000000000000005");
    expect(r.subjectIdentifier).toBe("CTDNA");

    expect(r.fingerprintCreated).toBeDefined();
    expect(r.fingerprintCreated!.getUTCFullYear()).toBe(2024);
    expect(r.fingerprintCreated!.getUTCMonth()).toBe(10);
    expect(r.fingerprintCreated!.getUTCDate()).toBe(25);
    expect(r.fingerprintCreated!.getUTCHours()).toBe(4);
    expect(r.fingerprintCreated!.getUTCMinutes()).toBe(0);
    expect(r.fingerprintCreated!.getUTCSeconds()).toBe(7);
  });

  it("can handle a fingerprint with limited metadata", async () => {
    // this fingerprint is deliberately set to be missing created date and subject identifier
    // IT DOES HOWEVER HAVE A LIBRARY IDENTIFIER (so it has _some_ metadata)
    const r = await downloadAndCorrectFingerprint(
      "fingerprints-for-unit-tests/s3%3A%2F%2Fa-bucket%2Findividual-SBJ00125.bam.somalier",
      "s3://blah",
      2
    );

    expect(r.generatedSampleId).toBe("0000002");
    expect(r.subjectIdentifier).toBe("SBJ00125");
    expect(r.libraryIdentifier).toBe("ALIB");

    expect(r.fingerprintCreated).toBeDefined();
    expect(r.fingerprintCreated!.getUTCFullYear()).toBe(2024);
    expect(r.fingerprintCreated!.getUTCMonth()).toBe(10);
    expect(r.fingerprintCreated!.getUTCDate()).toBe(25);
    expect(r.fingerprintCreated!.getUTCHours()).toBe(5);
    expect(r.fingerprintCreated!.getUTCMinutes()).toBe(19);
    expect(r.fingerprintCreated!.getUTCSeconds()).toBe(43);
  });
});
