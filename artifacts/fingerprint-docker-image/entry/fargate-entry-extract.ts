import { argv } from "process";
import { fingerprintExtract } from "../lib/fingerprint-extract";

if (argv.length < 3) {
  throw Error(
    "Extract must be invoked with argument <json-serialized-args-from-steps-input>"
  );
}

// argv[0] = nodejs
// argv[1] = extract.cjs
// argv[2] = string that is serialised JSON

// we pass the JSON structure that arrives as the Steps input direct
// to the Fargate task as a parameter
// this avoids having to decompose/recompose the args as command line args
// BUT DOES MEAN WE NEED TO KEEP THIS ARG STRUCTURE IN SYNC WITH
// THE STEPS INPUTS

const args = JSON.parse(argv[2]);

console.log(args);

(async () => {
  if (!args.index)
    throw new Error(
      "Must pass in an index BAM to fingerprint (.index: string)"
    );

  if (!args.reference)
    throw new Error(
      "Must pass in an indicator of the reference data to use (.reference: string)"
    );

  if (!args.fingerprintFolder)
    throw new Error(
      "Must pass in a trailing slash folder where fingerprints live (.fingerprintFolder: string)"
    );

  if (
    args.subjectIdentifier ||
    args.subjectId ||
    args.subjectID ||
    args.individualIdentifier
  ) {
    throw new Error(
      "Mistaken field name for individual - should be individualId"
    );
  }

  if (args.libraryIdentifier || args.libraryID) {
    throw new Error("Mistaken field name for library - should be libraryId");
  }

  try {
    await fingerprintExtract(
      args.index,
      args.reference,
      args.fingerprintFolder,
      args.individualId,
      args.libraryId,
      !!args.excludeFromCheck,
      !!args.autoExpire
    );
  } catch (e) {
    console.error(
      "Fargate entrypoint caught exception from fingerprintExtract() function"
    );
    console.error(e);
    throw e;
  }
})();
