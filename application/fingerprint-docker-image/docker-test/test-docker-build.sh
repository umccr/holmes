#!/bin/sh

# build the parent docker image twice, once for lambda and once for fargate

docker build --platform linux/amd64 -t fingerprint ..
#docker build --platform linux/amd64 --target fargate -t fingerprint-fargate ..
