import { extract } from "./lib/extract";

type EventInput = {
  // the URL of the BAMs we are checking against all others
  indexes: string[];

  // the slash terminated folder where the fingerprints are to be sourced in S3 (i.e. the folder key + /)
  fingerprintFolder: string;

  reference: string;
};

export const lambdaHandler = async (ev: EventInput, context: any) => {
  await extract(ev.reference, ev.fingerprintFolder, ev.indexes);

  return {};
};
