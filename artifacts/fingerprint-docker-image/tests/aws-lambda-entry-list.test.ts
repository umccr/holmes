import { lambdaHandler } from "../lambda-entry-list";

import {
  HG002_URL,
  HG003_URL,
  UNIT_TEST_FINGERPRINT_FOLDER,
  UNIT_TEST_SLACK_CHANNEL,
} from "./aws-test-constants";

describe("Fingerprint list in AWS", () => {
  test("basic check of listing the fingerprints", async () => {
    const r = await lambdaHandler(
      {
        indexes: [],
        regexes: [".*HG.*"],
        fingerprintFolder: `${UNIT_TEST_FINGERPRINT_FOLDER}/`,
      },
      {}
    );

    console.log(r);
  });

  xtest("send a report to Slack", async () => {
    const r = await lambdaHandler(
      {
        indexes: [HG002_URL, HG003_URL],
        regexes: [".*HG.*"],
        fingerprintFolder: `${UNIT_TEST_FINGERPRINT_FOLDER}/`,
        channelId: UNIT_TEST_SLACK_CHANNEL,
      },
      {}
    );
  });
});
