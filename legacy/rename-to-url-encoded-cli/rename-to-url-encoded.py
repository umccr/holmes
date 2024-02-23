import urllib
import boto3
import binascii
import argparse


#
# A utility that managed the conversion from hexencoded fingerprints to URL encoded.
# It also converts the fingerprint LastModified date into a metadata field (otherwise we
# this info when we make the copy)
#
# This can safely be run on the same bucket/folder multiple times - it only does
# work when it finds actual hexencoded fingerprints
#
if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        prog='rename-to-url-encoded',
        description='Converts hexencoded fingerprints to URL encoded fingerprints')

    parser.add_argument('folder')
    parser.add_argument('bucket', nargs='?', default='umccr-fingerprint-local-dev-test')

    args = parser.parse_args()

    if args.folder[-1] != '/':
        print("Fingerprint folder must end with a slash")
        exit(1)

    s3 = boto3.resource('s3')
    s3_paginator = boto3.client('s3').get_paginator('list_objects_v2')

    def keys(bucket_name, prefix='/', delimiter='/', start_after=''):
        prefix = prefix[1:] if prefix.startswith(delimiter) else prefix
        start_after = (start_after or prefix) if prefix.endswith(delimiter) else start_after
        for page in s3_paginator.paginate(Bucket=bucket_name, Prefix=prefix, StartAfter=start_after):
            for content in page.get('Contents', ()):
                yield content['LastModified'], content['Key']


    for d, p in keys(args.bucket, prefix=args.folder):
        encoded: str = p[len(args.folder):]

        try:
            # we only want to rename the remaining objects that are our Hex encoded ones
            if "%" not in encoded:
                decoded = binascii.unhexlify(encoded).decode('utf-8')

                source = args.folder + encoded
                dest = args.folder + urllib.parse.quote(decoded, safe='') + ".somalier"
                isocreated = d.isoformat().replace('+00:00', 'Z')

                s3.Object(args.bucket, dest).copy_from(
                    CopySource={'Bucket': args.bucket, 'Key': source},
                    Metadata={"fingerprint-created": isocreated},
                    MetadataDirective='REPLACE')

                s3.Object(args.bucket, source).delete()

                print("Moved %s to %s with created date of %s" % (source, dest, isocreated))
        except Exception as e:
            print("Could not convert %s" % encoded)
