/**
 * The S3 fingerprint type represents a fingerprint
 * that we have stored in an S3 bucket.
 */
export type S3Fingerprint = {
  bucket: string;

  key: string;

  // if present, then this is a fingerprint created from a BAM file
  // if not present, then this is probably a control sample or something other
  // fingerprint artifacts we are using for other purposes
  url?: URL;

  // if present, the library identifier for this fingerprint derived from the URL
  libraryId?: string;

  // if present, the date of when this fingerprint was created (this represents our metadata
  // field not the actual object created date)
  created?: Date;

  // if present, represents a displayable string version of the created date in Melbourne
  // timezone
  createdMelbourneDisplay?: string;

  // if present, the individual identifier for this fingerprint
  individualId?: string;

  // for admin purposes it is useful to know
  individualIdCameFromUrl?: boolean;

  // if present and true, this fingerprint should not ever match with a "check"
  excludeFromCheck?: boolean;
};
