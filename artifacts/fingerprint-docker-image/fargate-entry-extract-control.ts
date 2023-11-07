import { argv } from "process";
import { extract } from "./lib/extract";
import {
  ENV_NAME_FINGERPRINT_CONTROL_FOLDER,
  ENV_NAME_FINGERPRINT_REFERENCE,
} from "./fargate-env";

// NOTE: we use some environment variables here only because steps/fargate conspire to be terrible
// at allowing us to invoke Fargate sensibly

(async () => {
  try {
    const reference = process.env[ENV_NAME_FINGERPRINT_REFERENCE];

    if (!reference)
      throw Error(`Must set env ${ENV_NAME_FINGERPRINT_REFERENCE}`);

    const fingerprintControlFolder =
      process.env[ENV_NAME_FINGERPRINT_CONTROL_FOLDER];

    if (!fingerprintControlFolder)
      throw Error(`Must set env ${ENV_NAME_FINGERPRINT_CONTROL_FOLDER}`);

    await extract(reference, fingerprintControlFolder, argv.slice(2));
  } catch (e) {
    console.error(
      "Fargate control entrypoint caught exception from extract() function"
    );
    console.error(e);

    process.exit(1);
  }
})();
