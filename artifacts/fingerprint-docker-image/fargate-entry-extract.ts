import { argv } from "process";
import { extract } from "./lib/extract";

if (argv.length < 7) {
  throw Error(
    "Extract must be invoked with arguments <reference> <fingerprintFolder> <subjectid> <libraryid> <bam> [bam...]"
  );
}

// argv[0] = nodejs
// argv[1] = extract.cjs
// argv[2] = reference genome name
// argv[3] = folder
// argv[4] = subject identifier
// argv[5] = library identifier
// argv[6] = BAM paths...

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

const libraryId = argv[5];

if (libraryId.trim().length === 0)
  throw Error(
    `Must provide a library identifier that applies to all BAMs as the fourth argument to the extract process`
  );

(async () => {
  try {
    await extract(
      reference,
      fingerprintFolder,
      subjectId,
      libraryId,
      argv.slice(6)
    );
  } catch (e) {
    console.error(
      "Fargate entrypoint caught exception from extract() function"
    );
    console.error(e);
  }
})();
