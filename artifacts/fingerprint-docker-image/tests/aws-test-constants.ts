// we have hand crafted an AWS bucket with fingerprints that can be used for the
// unit tests

export const UNIT_TEST_FINGERPRINT_FOLDER = "fingerprints-for-unit-tests";

export const HG002_KEY = `${UNIT_TEST_FINGERPRINT_FOLDER}/s3%3A%2F%2Fa-bucket%2FHG002-ready.bam.somalier`;
export const HG002_URL = "s3://a-bucket/HG002-ready.bam";

export const HG003_KEY = `${UNIT_TEST_FINGERPRINT_FOLDER}/s3%3A%2F%2Fa-bucket%2FHG003-ready.bam.somalier`;
export const HG003_URL = "s3://a-bucket/HG003-ready.bam";

export const HG004_KEY = `${UNIT_TEST_FINGERPRINT_FOLDER}/s3%3A%2F%2Fa-bucket%2FHG004-ready.bam.somalier`;
export const HG004_URL = "s3://a-bucket/HG004-ready.bam";

export const HG0096_KEY = `${UNIT_TEST_FINGERPRINT_FOLDER}/s3%3A%2F%2Fa-bucket%2FHG00096.bam.somalier`;
export const HG0096_URL = "s3://a-bucket/HG00096.bam";

// this corresponds to biofingerprinting-dev Slack channel in the UMCCR Slack
// not strictly for the unit tests but is useful for devs to see what the Slack reports might look like
export const UNIT_TEST_SLACK_CHANNEL = "C0830QBARMX";
