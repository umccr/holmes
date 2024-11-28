const { mkdtemp, open } = require("node:fs/promises");
const { join } = require("path");
const { tmpdir } = require("node:os");

// Somalier is a tricky binary to build on either ARM or a Mac - and of course most of
// our dev work is now done on Macs. So what we have here is a kludge to make launching
// the Docker version of somalier for unit tests.

// this also has the advantage of setting up a standalone folder for each test run
// that we can download objects into and know that it is empty

module.exports = async () => {
  const localTmp = await mkdtemp(join(tmpdir(), "holmes-"));

  // console.debug(`Executing somalier jest tests in ${localTmp}`);

  // for unit testing purposes we don't want to ever download the reference genomes
  // as that takes minutes
  // so we create empty files - unless we actually do a somalier extract nothing
  // requires these to be valid
  const fasta = `${localTmp}/reference.fa`;
  const fastaIndex = `${localTmp}/reference.fa.fai`;

  await (await open(fasta, "a")).close();
  await (await open(fastaIndex, "a")).close();

  process.env = Object.assign(process.env, {
    FINGERPRINT_BUCKET_NAME: "umccr-fingerprint-local-dev-test",
    FINGERPRINT_CONFIG_FOLDER: "config/",
    SOMALIER: `docker run --workdir /tmp --mount type=bind,source=${localTmp},target=/tmp --rm --platform linux/amd64 brentp/somalier somalier`,
    SOMALIERTMP: localTmp,
    SOMALIERSITES: `${localTmp}/sites.vcf.gz`,
    SOMALIERFASTA: fasta,
    SOMALIERFASTAINDEX: fastaIndex,
  });
};
