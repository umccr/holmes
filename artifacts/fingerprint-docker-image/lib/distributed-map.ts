import { s3GetObjectAsJson } from "./aws";

export async function distributedMapManifestToLambdaResults(
  bucket: string,
  key: string
): Promise<Record<string, any[]>[]> {
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

  const lambdaOutputsJson: Record<string, any[]>[] = [];

  for (const lambdaResult of successJson) {
    const lambdaJson: Record<string, any[]> = JSON.parse(lambdaResult.Output);
    lambdaOutputsJson.push(lambdaJson);
  }

  return lambdaOutputsJson;
}
