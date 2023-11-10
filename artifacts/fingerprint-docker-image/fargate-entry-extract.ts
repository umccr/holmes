import { argv } from "process";
import { extract } from "./lib/extract";

if (argv.length < 5) {
  throw Error(
    "Extract must be invoked with arguments <reference> <fingerprintFolder> <bam> [bam...]"
  );
}

// argv[0] = nodejs
// argv[1] = extract.cjs

const reference = argv[2];

if (reference.trim().length === 0)
  throw Error(
    `Must provide a reference name as the first argument to the extract process`
  );

const fingerprintFolder = argv[3];

if (fingerprintFolder.trim().length === 0)
  throw Error(
    `Must provide a fingerprint folder name (with trailing slash) as the second argument to the extract process`
  );

(async () => {
  try {
    await extract(reference, fingerprintFolder, argv.slice(4));
  } catch (e) {
    console.error(
      "Fargate entrypoint caught exception from extract() function"
    );
    console.error(e);
    process.exit(1);
  }

  process.exit(0);
})();
