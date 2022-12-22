#!/bin/sh

SECRET_ARN="arn:aws:secretsmanager:ap-southeast-2:843407916570:secret:IcaSecretsPortal" # pragma: allowlist secret
BN="umccr-fingerprint-local-dev-test"                                                   # pragma: allowlist secret
DI="fingerprint-dev-extract-test"

docker build --platform linux/amd64 -t $DI ../application/fingerprint-docker-image

# from the temp directory where we generate fingerprints we delete all fingerprint looking files
# (those starting 676473 i.e gds:// and those starting 7333 i.e. s3://)
aws s3 rm "s3://$BN/temp/" --exclude "*" --include "676473*" --include "7333*"

echo "There should be three fingerprint files generated - it should take 5 mins"

# notes: we bind in our local copies of the reference files so that we can skip the download step
# we don't bind in a copy of the sites file as it is small *and* this tests out the download step
docker run --rm --platform linux/amd64 \
  --env AWS_REGION \
  --env AWS_ACCESS_KEY_ID \
  --env AWS_SECRET_ACCESS_KEY \
  --env AWS_SESSION_TOKEN \
  --env "SECRET_ARN=$SECRET_ARN" \
  --env "FINGERPRINT_BUCKET_NAME=$BN" \
  --env "FINGERPRINT_CONFIG_FOLDER=config/" \
  --env "FINGERPRINT_FOLDER=temp/" \
  --env "FINGERPRINT_REFERENCE=hg38.rna" \
  --mount "type=bind,source=$(pwd)/reference.hg38.rna.fa,target=/tmp/reference.fa" \
  --mount "type=bind,source=$(pwd)/reference.hg38.rna.fa.fai,target=/tmp/reference.fa.fai" \
  --entrypoint node \
           $DI \
           "/var/task/extract.cjs" \
            "s3://umccr-fingerprint-local-dev-test/test-bams/HG002-ready.bam"



aws s3 ls "s3://$BN/temp/"

#           "gds://development/test-data/holmes-test-data/family/giab_exome_trio/HG002-ready.bam"
#            "s3://umccr-fingerprint-local-dev-test/test-bams/HG003.bam" \
#           "gds://umccr-research/test_data/CCR180149_tumor_mini.bam"
  #         "gds://development/test-data/holmes-test-data/individual/HG00096.bam" \
 #          "gds://development/test-data/holmes-test-data/family/giab_exome_trio/HG002-ready.bam" \
#            "s3://umccr-fingerprint-local-dev-test/test-bams/HG003.bam" \
  #           "s3://umccr-fingerprint-local-dev-test/test-bams/HG004.bam" \


# https://umccr-fingerprint-local-dev-test.s3.ap-southeast-2.amazonaws.com/test-bams/HG004.bam?
#         X-Amz-Algorithm=AWS4-HMAC-SHA256&
#         X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&
#         X-Amz-Credential=ASIA4IXYHPYNA42NQ2NL%2F20221221%2Fap-southeast-2%2Fs3%2Faws4_request&
#         X-Amz-Date=20221221T055851Z&
#         X-Amz-Expires=180&
#         X-Amz-Security-Token=IQoJb3JNwRmDUSeb0l7xsEGfcnOCCFcBkN%2FrJUzppUDun4kcWUv3LVB7Tvs%3D&
#         X-Amz-Signature=c86743e2fa25f2ea2c971ecb3d2635634823ad984fcec913f7f562ca48e1cbe1&
#         X-Amz-SignedHeaders=host##idx##https://umccr-fingerprint-local-dev-test.s3.ap-southeast-2.amazonaws.com/test-bams/HG004.bam.bai?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIA4IXYHPYNA42NQ2NL%2F20221221%2Fap-southeast-2%2Fs3%2Faws4_request&X-Amz-Date=20221221T055851Z&X-Amz-Expires=180&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEEsaDmFwLXNvdXRoZWFzdC0yIkgwRgIhAIPQv4sbcVtbATjSSpZMwNSdTcfTQOr1RBH7BJCAD7GAAiEA7VsxyHJmMsIYkVQnCqQW75ikior%2BE2plMpD1y1dDK6AqpwMIhP%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FARADGgw4NDM0MDc5MTY1NzAiDJusn7VUI8uXYAzZ3ir7Aia5YyFtmqyVP0JuMIiXD1PGp3yJb%2BbFFqreGoNDR48RonV6tLabOJBx1DfyxcKBbayzsmQAZBA%2BUAKmhyxFx7pymUn5gJh17rEjBrRvQvRUjjVekwSEzVKRrsARdWBNxEmseZkZl%2Bb07%2FIqBcc1x4znRt8EDpPlIJtG2ZOfjLi95iVa1oM%2F8FMHrRzU6qVSEkkBC%2BdpZofFsNNKOtvy%2FgZwPUsiV4Utd6gCqZqyuevXN8WV19ybC0f%2BSvR%2B1HN7FIItCOVlracbWjHZvvlHir%2BJNpanTGGQBmIMDCImGo3Fdqrdf39OKTu1Xu5oQq9FHcVoQ5ppNP%2FR0HHDRhl6ZLASy983FzKLnBp07wBbQgPIO7Q1e1u9VmZe%2Ft3Kj%2F%2Bs%2BjHUU%2F1NUX3ObT8fkJJpv5IrqQlm0%2F6tYrM5zlKRhRipgpxk7I3inPpMdF8IIaaQ%2FtkLGNixz95oFAv8f2hGEg72JW7xPUaEobjY0eqglRaq%2BjNm84GnSUbh9nowgO2JnQY6pQHn1g%2BrQfdk251QMXm8BUV6bweOxhFZe230y2WvxyLH7z52Kgc5HTpay8sA2ZEw22Q%2BPadEOaMv1KvXrobziJtIibqT8uwv7jQUxTmsXd8NYl%2Fdl7z8i7s28wKHhe%2FroziB%2Fpz%2BoT6qwIF%2FaonGvtBqvHBIXXUFx5p4k74ZeNESwRmDUSeb0l7xsEGfcnOCCFcBkN%2FrJUzppUDun4kcWUv3LVB7Tvs%3D&X-Amz-Signature=ab2a2c45b793881a5bfa8b85efe817cfe690c5d2045593ab5a7cbb251562d19a&X-Amz-SignedHeaders=host
# https://stratus-gds-aps2.s3.ap-southeast-2.amazonaws.com/1f412e89-acc8-4337-b484-08d89d4636a9/test-data/holmes-test-data/individual/HG00096.bam?
#          X-Amz-Expires=604800&
#          response-content-disposition=filename%3D%22HG00096.bam%22&
#          response-content-type=application%2Fx-gzip&
#          x-userId=bc99b89c-3bb7-334b-80d1-20ef9e65f0b0&
#          X-Amz-Algorithm=AWS4-HMAC-SHA256&
#          X-Amz-Credential=AKIARFCPI2IG5QI3WUOB/20221221/ap-southeast-2/s3/aws4_request&
#          X-Amz-Date=20221221T060300Z&
#          X-Amz-SignedHeaders=host&
#          X-Amz-Signature=7cc9de1318d62dd8f2b9f746ac979c2943a8aebd4c86659b8f6671854f8bdb43##idx##https://stratus-gds-aps2.s3.ap-southeast-2.amazonaws.com/1f412e89-acc8-4337-b484-08d89d4636a9/test-data/holmes-test-data/individual/HG00096.bam.bai?X-Amz-Expires=604800&response-content-disposition=filename%3D%22HG00096.bam.bai%22&response-content-type=application%2Foctet-stream&x-userId=bc99b89c-3bb7-334b-80d1-20ef9e65f0b0&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIARFCPI2IG5QI3WUOB/20221221/ap-southeast-2/s3/aws4_request&X-Amz-Date=20221221T060300Z&X-Amz-SignedHeaders=host&X-Amz-Signature=535554c54e8a1007f5df3b62821d226a4a6ea05297af4441376876ddd0c5db1b