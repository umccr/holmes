import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { env as envDict } from "process";
import axios from "axios";

// module level cache of ICA JWT
let icaJwt: string | null = null;

const secretsClient = new SecretsManagerClient({});

export async function getIcaJwt(): Promise<string> {
  // on first use of a GDS link we need to get an ICA API JWT from secrets manager
  if (icaJwt == null) {
    const jwtSecretArn = envDict["SECRET_ARN"];

    if (!jwtSecretArn)
      throw new Error(
        "To use GDS links the lambdas must have an environment variable SECRET_ARN set to a secret holding an ICA JWT"
      );

    console.log("First use of GDS link so will fetch ICA JWT secret");

    const jwtResponse = await secretsClient.send(
      new GetSecretValueCommand({
        SecretId: jwtSecretArn,
      })
    );

    if (jwtResponse.SecretString) {
      icaJwt = jwtResponse.SecretString;
    } else
      throw new Error(
        `ICA Secret '${jwtSecretArn}' did not contain a SecretString with a ICA JWT`
      );
  }

  return icaJwt;
}

/**
 * Given a GDS files volume and path, use the ICA API to return a presigned S3 URL we can use for
 * downloading the content.
 *
 * @param volume the GDS volume (must be in APS2)
 * @param path the path to the file
 */
export async function getGdsFileAsPresigned(
  volume: string,
  path: string
): Promise<string> {
  const icaJwt = await getIcaJwt();

  const preSignedResponse = await axios.get(
    // TODO: allow configuration of platform - this is currently tied only to APS2
    `https://aps2.platform.illumina.com/v1/files?include=PresignedUrl&volume.name=${volume}&path=${path}`,
    {
      headers: {
        Authorization: `Bearer ${icaJwt}`,
      },
    }
  );

  // TODO: some error checking here on responses (investigate error codes from GDS)

  if (preSignedResponse.data.itemCount != 1) {
    // in the unusual case this happens we mind as well log the entire response
    console.log(preSignedResponse.data);
    throw new Error(
      `Could not find file gds://${volume}/${path} in GDS using the given ICA JWT permissions`
    );
  }

  const res = preSignedResponse?.data?.items[0]?.presignedUrl;

  if (!res) {
    // in the unusual case this happens we mind as well log the entire response
    console.log(preSignedResponse.data);
    throw new Error(
      `Could not construct pre-signed S3 URL for gds://${volume}/${path}`
    );
  }

  return res;
}
