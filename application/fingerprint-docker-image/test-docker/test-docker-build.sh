#!/bin/sh

# build the parent docker image

docker build --platform linux/amd64 -t fingerprint ..
