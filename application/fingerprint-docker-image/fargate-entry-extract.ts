import { argv } from "process";
import { extract } from "./lib/extract";
import {
  ENV_NAME_FINGERPRINT_FOLDER,
  ENV_NAME_FINGERPRINT_REFERENCE,
} from "./lib/env";

(async () => {
  try {
    const reference = process.env[ENV_NAME_FINGERPRINT_REFERENCE];

    if (!reference)
      throw Error(`Must set env ${ENV_NAME_FINGERPRINT_REFERENCE}`);

    const fingerprintFolder = process.env[ENV_NAME_FINGERPRINT_FOLDER];

    if (!fingerprintFolder)
      throw Error(`Must set env ${ENV_NAME_FINGERPRINT_FOLDER}`);

    await extract(reference, fingerprintFolder, argv.slice(2));
  } catch (e) {
    console.error(
      "Fargate entrypoint caught exception from extract() function"
    );
    console.error(e);

    process.exit(1);
  }
})();
