import { promisify } from "util";
import { chdir, env as envDict } from "process";
import { execFile as execFileCallback } from "child_process";
import { URL } from "url";
import { getGdsFileAsPresigned } from "./gds";

/**
 * THIS IS NOT PRODUCTION - IT WAS A PROOF OF CONCEPT OF WHETHER WE COULD DO THE EXTRACT
 * IN A LAMBDA - WHILST POSSIBLE IT DOES NOT LOOK LIKE IT WILL CONSISTENTLY WORK
 * IN THE 15 MIN LIMIT
 */

// get this functionality as promise compatible funcs
const execFile = promisify(execFileCallback);

// by default, we obviously want this setup to work correctly in a lambda
// HOWEVER, it is useful to be able to override these on an execution basis for local testing etc
// THIS IS STRICTLY FOR USE IN DEV SETUPS - THESE PATHS ARE NOT CHECKED OR WHITELISTED - BAD THINGS CAN
// HAPPEN IF YOU ARE LETTING PEOPLE INVOKE THIS AND LETTING THEM SET THE ENV VARIABLES
const somalierBinary = envDict["SOMALIER"] || "/var/task/somalier";
const somalierWork = envDict["SOMALIERTMP"] || "/tmp";
const somalierSites = envDict["SOMALIERSITES"] || "/var/task/sites.vcf.gz";
const somalierFasta =
  envDict["SOMALIERFASTA"] || "/var/task/Homo_sapiens_assembly38.fasta";

type EventInput = {
  index: string;
};

export const lambdaHandler = async (ev: EventInput, context: any) => {
  // only small areas of the lambda runtime are read/write so we need to make sure we are in a writeable working dir
  chdir(somalierWork);

  // the index string is the eventual string we need to pass to somalier extract..
  // but depending on the protocol we need to do different things (i.e. it is not always just the index)
  let indexString;

  const url = new URL(ev.index);

  if (url.protocol === "s3:") {
    indexString = ev.index;
  } else if (url.protocol === "gds:") {
    const presignedUrl = await getGdsFileAsPresigned(
      url.hostname,
      url.pathname
    );
    const presignedUrlBai = await getGdsFileAsPresigned(
      url.hostname,
      url.pathname + ".bai"
    );

    // this is the undocumented mechanism of nim-htslib to have a path that also specifies the actual index file
    indexString = `${presignedUrl}##idx##${presignedUrlBai}`;
  } else {
    throw new Error(`Unknown file download technique for ${url}`);
  }

  // do a somalier extract to generate the fingerprint
  const { stdout, stderr } = await execFile(somalierBinary, [
    "extract",
    indexString,
    "-s",
    somalierSites,
    "-f",
    somalierFasta,
  ]);

  if (stdout) {
    stdout.split("\n").forEach((l) => console.log(`stdout ${l}`));
  }
  if (stderr) {
    stderr.split("\n").forEach((l) => console.log(`stderr ${l}`));
  }

  // TODO: would need to do something with the result file - upload to GDS/S3..

  return {};
};
