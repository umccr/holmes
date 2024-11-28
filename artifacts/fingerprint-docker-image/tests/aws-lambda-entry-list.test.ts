import { lambdaHandler } from "../lambda-entry-list";

import {
  HG002_URL,
  HG003_URL,
  HG004_URL,
  UNIT_TEST_FINGERPRINT_FOLDER,
  UNIT_TEST_SLACK_CHANNEL,
} from "./aws-test-constants";

describe("Fingerprint list in AWS", () => {
  test("basic check of listing the fingerprints when specified by URL", async () => {
    const r = await lambdaHandler(
      {
        indexes: [HG002_URL, HG004_URL],
        regexes: [],
        fingerprintFolder: `${UNIT_TEST_FINGERPRINT_FOLDER}/`,
      },
      {}
    );

    expect(r).toBeDefined();
    expect(r.length).toBe(2);
  });

  test("basic check of listing the fingerprints when specified by regex of URL", async () => {
    const r = await lambdaHandler(
      {
        indexes: [],
        regexes: [".*HG.*"],
        fingerprintFolder: `${UNIT_TEST_FINGERPRINT_FOLDER}/`,
      },
      {}
    );

    expect(r).toBeDefined();
    expect(r.length).toBe(4);
  });

  test("basic check of listing the fingerprints when specified by regex that matches subject identifier", async () => {
    const r = await lambdaHandler(
      {
        indexes: [],
        regexes: [".*CELL.*"],
        fingerprintFolder: `${UNIT_TEST_FINGERPRINT_FOLDER}/`,
      },
      {}
    );

    expect(r).toBeDefined();
    expect(r.length).toBe(1);
  });

  test("basic check of listing the fingerprints when specified by regex that matches inferred subject identifier", async () => {
    const r = await lambdaHandler(
      {
        indexes: [],
        regexes: [".*SBJ.*"],
        fingerprintFolder: `${UNIT_TEST_FINGERPRINT_FOLDER}/`,
      },
      {}
    );

    expect(r).toBeDefined();
    expect(r.length).toBe(1);
  });

  test("basic check of listing the fingerprints when specified by all regex", async () => {
    const r = await lambdaHandler(
      {
        indexes: [],
        regexes: [".*"],
        fingerprintFolder: `${UNIT_TEST_FINGERPRINT_FOLDER}/`,
      },
      {}
    );

    expect(r).toBeDefined();
    expect(r.length).toBe(8);
  });

  test("send a report to Slack", async () => {
    const r = await lambdaHandler(
      {
        indexes: [HG002_URL, HG003_URL],
        regexes: [],
        fingerprintFolder: `${UNIT_TEST_FINGERPRINT_FOLDER}/`,
        channelId: UNIT_TEST_SLACK_CHANNEL,
      },
      {}
    );
  });
});
