import { S3Fingerprint } from "./s3-fingerprint";

/**
 * Take the metadata records from an S3 Head or Get and set
 * any applicable fields of our fingerprint record.
 *
 * @param key the S3 fingerprint key
 * @param m the metadata from an S3 GET or HEAD on a fingerprint
 * @param f the fingerprint object to set
 * @returns the fingerprint object passed in
 */
export function s3FingerprintMetadataApply(
  key: string,
  m: Record<string, string>,
  f: S3Fingerprint
): S3Fingerprint {
  const createdMeta = m["fingerprint-created"];

  if (createdMeta) f.created = new Date(Date.parse(createdMeta));

  const subjectMeta = m["subject-identifier"];

  if (subjectMeta) f.subjectIdentifier = subjectMeta.trim();
  else {
    // we can have older samples that used to get subject ids from their BAM URL
    const re = new RegExp(/.*(SBJ\d\d\d\d\d).*/);
    const r = key.match(re);
    if (r) f.subjectIdentifier = r[1];
  }

  const libraryMeta = m["library-identifier"];

  if (libraryMeta) f.libraryIdentifier = libraryMeta.trim();
  else {
    // we can have older libraries that used to get library ids from their BAM URL
    const re = new RegExp(/.*(L\d\d\d\d\d\d\d).*/);
    const r = key.match(re);
    if (r) f.libraryIdentifier = r[1];
  }

  return f;
}
