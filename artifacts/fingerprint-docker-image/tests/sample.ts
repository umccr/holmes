import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { join } from "path";

// when run by our jest we will be in ESM mode and hence import.meta will work
// @ts-ignore
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const SAMPLE_PAIRS_PATH = join(__dirname, "sample-pairs.tsv");
export const SAMPLE_SAMPLES_PATH = join(__dirname, "sample-samples.tsv");
