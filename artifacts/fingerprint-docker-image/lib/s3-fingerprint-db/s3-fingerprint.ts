/**
 * The S3 fingerprint type represents a fingerprint
 * that we have stored in an S3 bucket.
 */
export type S3Fingerprint = {
  bucket: string;

  key: string;

  // if present, the date of when this fingerprint was created (this represents our metadata
  // field not the actual object created date)
  created?: Date;

  // if present, the subject identifier for this fingerprint
  subjectIdentifier?: string;

  // if present, the library identifier for this fingerprint
  libraryIdentifier?: string;

  // if present and true, this fingerprint was identified as a control sample
  isControl?: boolean;
};
