// NOTE: this is used *only* as an env variable for passing to Fargate because Fargate has crappy input
// the reference fingerprint is a string such hg38.rna which defines the reference sites file
export const ENV_NAME_FINGERPRINT_REFERENCE = "FINGERPRINT_REFERENCE";

// NOTE: this is used *only* as an env variable for passing to Fargate because Fargate has crappy input
// the fingerprint folder is the canonical spot where fingerprints are stored for normal checking
export const ENV_NAME_FINGERPRINT_FOLDER = "FINGERPRINT_FOLDER";

// NOTE: this is used *only* as an env variable for passing to Fargate because Fargate has crappy input
// the fingerprint control folder is the spot where fingerprints are stored for control checking
export const ENV_NAME_FINGERPRINT_CONTROL_FOLDER = "FINGERPRINT_CONTROL_FOLDER";
