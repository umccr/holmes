// we have hand crafted an AWS bucket with fingerprints that can be used for the
// unit tests

export const UNIT_TEST_FINGERPRINT_BUCKET = "umccr-fingerprint-local-dev-test";
export const UNIT_TEST_FINGERPRINT_FOLDER = "fingerprints-for-unit-tests";

//
// The list of sample fingerprints that are present in our unit test bucket
// Obviously if you add fingerprints to the bucket you probably should add constants here
// These are in alphabetic order (of Key)
//

export const HG00096_KEY = `${UNIT_TEST_FINGERPRINT_FOLDER}/s3%3A%2F%2Fa-bucket%2FHG00096.bam.somalier`;
export const HG00096_URL = "s3://a-bucket/HG00096.bam";

export const HG002_KEY = `${UNIT_TEST_FINGERPRINT_FOLDER}/s3%3A%2F%2Fa-bucket%2FHG002-ready.bam.somalier`;
export const HG002_URL = "s3://a-bucket/HG002-ready.bam";

export const HG003_KEY = `${UNIT_TEST_FINGERPRINT_FOLDER}/s3%3A%2F%2Fa-bucket%2FHG003-ready.bam.somalier`;
export const HG003_URL = "s3://a-bucket/HG003-ready.bam";

export const HG004_KEY = `${UNIT_TEST_FINGERPRINT_FOLDER}/s3%3A%2F%2Fa-bucket%2FHG004-ready.bam.somalier`;
export const HG004_URL = "s3://a-bucket/HG004-ready.bam";

export const NOMETADATA_KEY = `${UNIT_TEST_FINGERPRINT_FOLDER}/s3%3A%2F%2Fa-bucket%2Findividual-no-metadata.bam.somalier`;
export const NOMETADATA_URL = "s3://a-bucket/individual-no-metadata.bam";

export const SOME_METADATA_BUT_SUBJECT_KEY = `${UNIT_TEST_FINGERPRINT_FOLDER}/s3%3A%2F%2Fa-bucket%2Findividual-some-metadata-but-named-SBJ00125.bam.somalier`;
export const SOME_METADATA_BUT_SUBJECT_URL =
  "s3://a-bucket/individual-some-metadata-but-named-SBJ00125.bam";

export const PTC_CTTSO_KEY = `${UNIT_TEST_FINGERPRINT_FOLDER}/s3%3A%2F%2Fanother-bucket%2FPTC_ctTSO220404_L2200417.bam.somalier`;
export const PTC_CTTSO_URL = "s3://another-bucket/PTC_ctTSO220404_L2200417.bam";

export const PTC_T_KEY = `${UNIT_TEST_FINGERPRINT_FOLDER}/s3%3A%2F%2Fanother-bucket%2FPTC_TsqN200511_N.bam.somalier`;
export const PTC_T_URL = "s3://another-bucket/PTC_TsqN200511_N.bam";

// this corresponds to biofingerprinting-dev Slack channel in the UMCCR Slack
// not strictly for the unit tests but is useful for devs to see what the Slack reports might look like
export const UNIT_TEST_SLACK_CHANNEL = "C0830QBARMX";
