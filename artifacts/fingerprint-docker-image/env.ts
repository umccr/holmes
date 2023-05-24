// note these are all officially set in the other lambda/CDK stack - but we do not share
// any typescript files between these.. so they have to be defined here and kept in sync
const folderEnvName = "FINGERPRINT_FOLDER";
const relatednessEnvName = "RELATEDNESS_THRESHOLD";
const minNEnvName = "MINIMUM_N_COUNT";
const excludeRegexEnvName = "EXCLUDE_REGEX";
const expectRelatedRegexEnvName = "EXPECT_RELATED_REGEX";

export function getFromEnv() {
  if (!process.env[folderEnvName])
    throw new Error(`Lambda env is missing ${folderEnvName}`);

  if (!process.env[relatednessEnvName])
    throw new Error(`Lambda env is missing ${relatednessEnvName}`);

  if (!process.env[minNEnvName])
    throw new Error(`Lambda env is missing ${minNEnvName}`);

  return {
    fingerprintFolder: process.env[folderEnvName],
    relatednessThreshold: parseFloat(process.env[relatednessEnvName]!),
    minimumNCount: parseInt(process.env[minNEnvName]!),
    excludeRegex: process.env[excludeRegexEnvName],
    expectRelatedRegex: process.env[expectRelatedRegexEnvName],
  };
}
