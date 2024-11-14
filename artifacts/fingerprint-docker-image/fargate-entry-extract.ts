import { argv } from "process";
import { extract } from "./lib/extract";

if (argv.length < 6) {
  throw Error(
    "Extract must be invoked with arguments <reference> <fingerprintFolder> <subjectid> <bam> [bam...]"
  );
}

// argv[0] = nodejs
// argv[1] = extract.cjs
// argv[2] = reference genome name
// argv[3] = folder
// argv[4] = subject identifier
// argv[5] = BAM paths...

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

const subjectId = argv[4];

if (subjectId.trim().length === 0)
  throw Error(
    `Must provide a subject identifier that applies to all BAMs as the third argument to the extract process`
  );

(async () => {
  try {
    await extract(reference, fingerprintFolder, subjectId, argv.slice(5));
  } catch (e) {
    console.error(
      "Fargate entrypoint caught exception from extract() function"
    );
    console.error(e);
    process.exit(1);
  }

  process.exit(0);
})();
