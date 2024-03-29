import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { env as envDict } from "process";
import axios from "axios";
import * as rax from "retry-axios";

// module level cache of ICA JWT
let icaJwt: string | null = null;

// note we haven't confronted what we do for non-aps2 data
const ICA_BASE_URL = "https://aps2.platform.illumina.com/v1";

const secretsClient = new SecretsManagerClient({});

export interface GdsFile {
  // id: 'fil.f8d05e81ee214b47061e08d9fd472eb2',
  //       name: 'host_unmapped_or_mate_unmapped_to_gdc.bam',
  //       volumeId: 'vol.1f412e89acc84337b48408d89d4636a9',
  //       parentFolderId: 'fol.e40cae5765f8430e05ca08d9fd472eb2',
  //       volumeName: 'development',
  //       type: 'binary/octet-stream',
  //       tenantId: 'YXdzLXVzLXBsYXRmb3JtOjEwMDAwNTM3OjBiYTU5YWUxLWZkYWUtNDNiYS1hM2I1LTRkMzY3YTQzYWJkNQ',
  //       subTenantId: 'uid:bc99b89c-3bb7-334b-80d1-20ef9e65f0b0',
  //       path: '/analysis_data/SBJ00910/umccrise/202203130a31373d/L2100746__L2100745/work/SBJ00910__MDX210176/oncoviruses/work/detect_viral_reference/host_unmapped_or_mate_unmapped_to_gdc.bam',
  //       timeCreated: '2022-03-13T08:34:38.114Z',
  //       createdBy: 'bc99b89c-3bb7-334b-80d1-20ef9e65f0b0',
  //       timeModified: '2022-03-13T08:34:38.114Z',
  //       modifiedBy: 'bc99b89c-3bb7-334b-80d1-20ef9e65f0b0',
  //       urn: 'urn:ilmn:iap:aps2:YXdzLXVzLXBsYXRmb3JtOjEwMDAwNTM3OjBiYTU5YWUxLWZkYWUtNDNiYS1hM2I1LTRkMzY3YTQzYWJkNQ:file:fil.f8d05e81ee214b47061e08d9fd472eb2#/analysis_data/SBJ00910/umccrise/202203130a31373d/L2100746__L2100745/work/SBJ00910__MDX210176/oncoviruses/work/detect_viral_reference/host_unmapped_or_mate_unmapped_to_gdc.bam',
  //       sizeInBytes: 1532211946,
  //       isUploaded: true,
  //       archiveStatus: 'None',
  //       storageTier: 'Standard',
  //       eTag: 'd69ce35e1303de4a507e8f97947d9cc2-183',
  //       format: 'BAM',
  //       formatEdam: 'http://edamontology.org/format_2572',
  //       status: 'Available'
  id: string;
  name: string;
  volumeId: string;
  parentFolderId: string;
  volumeName: string;
  path: string;
  sizeInBytes: number;
  timeCreated: string;
  timeModified: string;
}

export interface GdsFolder {
  // {
  //   id: 'fol.3ff7cdb1c3014da9627208d89d4636ab',
  //   volumeId: 'vol.1f412e89acc84337b48408d89d4636a9',
  //   volumeName: 'development',
  //   tenantId: 'YXdzLXVzLXBsYXRmb3JtOjEwMDAwNTM3OjBiYTU5YWUxLWZkYWUtNDNiYS1hM2I1LTRkMzY3YTQzYWJkNQ',
  //   subTenantId: 'uid:6039c53c-d362-3dd6-9294-46f08d8994ff',
  //   urn: 'urn:ilmn:iap:aps2:YXdzLXVzLXBsYXRmb3JtOjEwMDAwNTM3OjBiYTU5YWUxLWZkYWUtNDNiYS1hM2I1LTRkMzY3YTQzYWJkNQ:folder:fol.3ff7cdb1c3014da9627208d89d4636ab#/',
  //   path: '/',
  //   acl: [
  //     'cid:dc8e6ba9-b744-437b-b070-4cf014694b3d',
  //     'tid:YXdzLXVzLXBsYXRmb3JtOjEwMDAwNTM3OjBiYTU5YWUxLWZkYWUtNDNiYS1hM2I1LTRkMzY3YTQzYWJkNQ'
  //   ],
  //   timeCreated: '2020-12-10T23:18:53.316003Z',
  //   createdBy: '6039c53c-d362-3dd6-9294-46f08d8994ff',
  //   timeModified: '2020-12-10T23:18:53.316003Z',
  //   modifiedBy: '6039c53c-d362-3dd6-9294-46f08d8994ff',
  //   jobStatus: 'None'
  // }
  id: string;
  name?: string; // note that root has no name
  path: string;
  timeCreated: string;
  timeModified: string;
}

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

  console.log(`GDS API call for details of file vol=${volume} path=${path}`);

  const preSignedResponse = await axios.get(
    `${ICA_BASE_URL}/files?include=PresignedUrl&volume.name=${volume}&path=${path}`,
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
      `Could not find file gds://${volume}${path} in GDS using the given ICA JWT permissions`
    );
  }

  const res = preSignedResponse?.data?.items[0]?.presignedUrl;

  if (!res) {
    // in the unusual case this happens we mind as well log the entire response
    console.log(preSignedResponse.data);
    throw new Error(
      `Could not construct pre-signed S3 URL for gds://${volume}${path}`
    );
  }

  return res;
}

/**
 * Given a GDS volume - find all the GDS file entries that match the file wildcard expression (just on the
 * file name portion - not including path)
 *
 * @param volume the GDS volume
 * @param pathPrefix the starting path to recursively search from
 * @param fileWildcard a wildcard expression encompassing *just* the name portion (i.e. * or *.bam or blah*)
 */
export async function* gdsFileSearchInVolume(
  volume: string,
  pathPrefix: string,
  fileWildcard: string = "*"
): AsyncGenerator<GdsFile> {
  const icaJwt = await getIcaJwt();

  // we setup our own axios instance so that we can implement a retry policy
  // we are occasionally hitting a DNS lookup issue - which I
  // think is Illuminas rate limiting mechanism
  const gdsAxios = axios.create();
  gdsAxios.defaults.raxConfig = {
    instance: gdsAxios,
  };
  const interceptorId = rax.attach(gdsAxios);

  // NOTE: this controls the degree to which we smash the Illumina API server - as for each folder page
  // we make concurrent! calls to list the folder.
  const RECURSIVE_FOLDER_PAGE_SIZE = 10;

  let pageToken = "";

  // we are doing a recursive folder search of the whole of the GDS volume - as GDS doesn't have any decent search APIs
  do {
    const folderSearchResult = await gdsAxios.get(
      `${ICA_BASE_URL}/folders?volume.name=${volume}&pageSize=${RECURSIVE_FOLDER_PAGE_SIZE}&path=${pathPrefix}/*&recursive=True&pageToken=${pageToken}`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${icaJwt}`,
        },
      }
    );

    // setup our do...while to cope with the next page of data available (or none)
    pageToken = folderSearchResult.data.nextPageToken;

    // for this whole page of folders - we are going to do a wildcard search *within* the folder
    const gdsFolders: GdsFolder[] = folderSearchResult.data.items || [];
    const gdsFoundMatches: GdsFile[] = [];

    // we construct the set of search promises and then will 'await' the whole set (to get us some nice
    // concurrency)
    const fileSearchPromises = gdsFolders.map((gdsFolder) =>
      gdsAxios
        .get(
          `${ICA_BASE_URL}/files?volume.name=${volume}&path=${gdsFolder.path}${fileWildcard}&pageSize=1000&recursive=False`,
          {
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${icaJwt}`,
            },
          }
        )
        .then((fileSearchResult) => {
          if (fileSearchResult?.data?.nextPageToken) {
            throw new Error(
              "GDS search is not setup for more than a pages worth of files *in a single folder*"
            );
          }

          const gdsFiles: GdsFile[] = fileSearchResult.data.items || [];

          if (fileSearchResult.data && fileSearchResult.data.items) {
            for (const file of gdsFiles) {
              gdsFoundMatches.push(file);
            }
          }
        })
    );

    // whack the API with a bunch of folder searches
    await Promise.all(fileSearchPromises);

    // yield up the collated results from this page
    for (const fb of gdsFoundMatches) yield fb;

    // onto the next page if possible
  } while (pageToken);
}
