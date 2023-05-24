import { s3GetObjectAsJson } from "./aws";
import {
  ExpectedRelatedType,
  HolmesReturnType,
  SelfType,
  UnexpectedRelatedType,
  UnexpectedUnrelatedType,
} from "./somalier-types";

export type HolmesResultMapType = {
  self?: SelfType;
  unexpectedRelated: UnexpectedRelatedType[];
  unexpectedUnrelated: UnexpectedUnrelatedType[];
  expectedRelated: ExpectedRelatedType[];

  // This is never reported back by the engine as it would involve 1000s of samples on every call
  // i.e. 99% of the fingerprint database is expected to be "unrelated" to other samples
  // expectedUnrelated: ExpectedUnrelatedType[];
};

/**
 * Process the result file output by an AWS Steps Distributed Map,
 * and convert it to something slightly easier for us to use.
 *
 * @param bucket
 * @param key
 */
export async function distributedMapManifestToLambdaResults(
  bucket: string,
  key: string
): Promise<Record<string, HolmesResultMapType>> {
  const manifestJson = await s3GetObjectAsJson(bucket, key);

  const manifestBucket: string = manifestJson.DestinationBucket;

  const failedObjects = manifestJson.ResultFiles.FAILED;
  const pendingObjects = manifestJson.ResultFiles.PENDING;
  const succeededObjects = manifestJson.ResultFiles.SUCCEEDED;

  if (
    failedObjects.length > 0 ||
    pendingObjects.length > 0 ||
    succeededObjects.length !== 1
  ) {
    // note: we could probably write our code to handle this but for the moment we are _well_ under this limit
    throw new Error(
      "We need our Holmes result to come back as a single success file that is under 5GiB"
    );
  }

  const successJson = await s3GetObjectAsJson(
    manifestBucket,
    succeededObjects[0].Key
  );

  return distributedMapSuccessJsonToLambdaResults(successJson);
}

/**
 * Convert a SUCCESS JSON structure into a more neat set of objects/maps. In
 * particular we merge the results from the distributed lambdas into a single
 * result for each index.
 *
 * @param successJson
 * @returns a map from each index URL to the corresponding holmes matches (of all types)
 */
export function distributedMapSuccessJsonToLambdaResults(successJson: any) {
  const lambdaOutputsJson: Record<string, HolmesResultMapType> = {};

  for (const lambdaResult of successJson) {
    // our distributed map has created a result per index per lambda execution
    // we really just want per index (we don't care how steps distributed the work)
    const lambdaJson: Record<string, HolmesReturnType[]> = JSON.parse(
      lambdaResult.Output
    );
    for (const [lambdaKey, lambdaArray] of Object.entries(lambdaJson)) {
      // we always want each index to appear in the results
      if (!(lambdaKey in lambdaOutputsJson))
        lambdaOutputsJson[lambdaKey] = {
          unexpectedRelated: [],
          unexpectedUnrelated: [],
          expectedRelated: [],
        };

      if (lambdaArray && lambdaArray.length > 0)
        for (const la of lambdaArray) {
          switch (la.type) {
            case "Self":
              if (lambdaOutputsJson[lambdaKey].self)
                throw new Error(
                  "Received two Self results from the Holmes engine"
                );

              lambdaOutputsJson[lambdaKey].self = la;
              break;
            case "UnexpectedRelated":
              lambdaOutputsJson[lambdaKey].unexpectedRelated.push(la);
              break;
            case "UnexpectedUnrelated":
              lambdaOutputsJson[lambdaKey].unexpectedUnrelated.push(la);
              break;
            case "ExpectedRelated":
              lambdaOutputsJson[lambdaKey].expectedRelated.push(la);
              break;
          }
        }
    }
  }

  return lambdaOutputsJson;
}
