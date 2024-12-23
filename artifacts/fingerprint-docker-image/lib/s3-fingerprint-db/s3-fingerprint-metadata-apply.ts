import { S3Fingerprint } from "./s3-fingerprint";
import { formatInTimeZone } from "date-fns-tz";

/**
 * Take the metadata records from an S3 Head or Get and set
 * any applicable fields of our fingerprint record.
 *
 * @param f the fingerprint object to set
 * @param key the S3 fingerprint key
 * @param lastModified the S3 last modified field or empty
 * @param m the metadata from an S3 GET or HEAD on a fingerprint or empty
 * @returns the fingerprint object passed in
 */
export function s3FingerprintMetadataApply(
  f: S3Fingerprint,
  key: string,
  lastModified: Date | undefined,
  m: Record<string, string> | undefined
): S3Fingerprint {
  const createdMeta = m ? m["fingerprint-created"] : undefined;

  if (createdMeta) f.created = new Date(Date.parse(createdMeta));
  else {
    if (lastModified) f.created = lastModified;
  }

  if (f.created) {
    f.createdMelbourneDisplay = formatInTimeZone(
      f.created,
      "Australia/Melbourne",
      "yyyy-MM-dd HH:mm:ss zzz"
    );
  }

  const subjectMeta = m ? m["individual-id"] : undefined;

  if (subjectMeta) {
    f.individualId = subjectMeta.trim();
    f.individualIdCameFromUrl = false;
  } else {
    // we can have older samples that used to get subject ids from their BAM URL
    const re = new RegExp(/.*(SBJ\d\d\d\d\d).*/);
    const r = key.match(re);
    if (r) {
      f.individualId = r[1];
      f.individualIdCameFromUrl = true;
    }
  }

  // const libraryMeta = m ? m["library-id"] : undefined;
  // if (libraryMeta) f.libraryId = libraryMeta.trim();
  // else {
  // because Library ids are *always* in the path name we do not store them in the metadata
  const re = new RegExp(/.*(L\d\d\d\d\d\d\d).*/);
  const r = key.match(re);
  if (r) f.libraryId = r[1];
  else {
    // we can also have external library designations
    const reExternal = new RegExp(/.*(LPRJ\d\d\d\d\d\d).*/);
    const rExternal = key.match(reExternal);
    if (rExternal) f.libraryId = rExternal[1];
  }
  // }

  return f;
}
