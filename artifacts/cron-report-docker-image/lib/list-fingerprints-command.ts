import { MainOpts } from "./opts";
import { s3ListAllFingerprintFiles } from "./common";

export async function listFingerprintsCommand(mainOpts: MainOpts) {
  for await (const i of s3ListAllFingerprintFiles(mainOpts.bucket, mainOpts.sc))
    console.log(bucketKeyToUrl(mainOpts, i.Key!));
}

function bucketKeyToUrl(mainOpts: MainOpts, key: string) {
  const buf = Buffer.from(key.substring(mainOpts.sc.length + 1), "hex");
  return buf.toString("utf8");
}
