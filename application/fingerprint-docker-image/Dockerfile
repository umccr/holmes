FROM --platform=linux/amd64 brentp/somalier:v0.2.16 as somalier-real

# we are going to grab the compile somalier binary out of the docker image

FROM --platform=linux/amd64 public.ecr.aws/lambda/nodejs:18 AS lambda-builder

COPY package*.json ./
RUN npm install

# esbuild is lightning quick so it doesn't really matter that we do a full rebuild of
# these all every time any one of them changes
COPY *.ts ./
COPY lib/ ./lib/
COPY tsconfig.json ./

RUN npx esbuild lambda-entry-check.ts --bundle --outfile=check.cjs --platform=node --target=node18
RUN npx esbuild lambda-entry-check-start.ts --bundle --outfile=checkstart.cjs --platform=node --target=node18
RUN npx esbuild lambda-entry-difference.ts --bundle --outfile=difference.cjs --platform=node --target=node18
RUN npx esbuild fargate-entry-extract.ts --bundle --outfile=extract.cjs --platform=node --target=node18

FROM --platform=linux/amd64 public.ecr.aws/lambda/nodejs:18 AS lambda

COPY --from=somalier-real /usr/bin/somalier ./
COPY --from=lambda-builder /var/task/*.cjs ./

# the somalier build environment bakes this path into its libcurl - so symlink to our real certs
RUN ln -s /etc/ssl/certs/ca-bundle.crt /etc/ssl/certs/ca-certificates.crt

# the CMD must be set as part of the lambda definition or docker invoke.. we have no default
CMD [ "fail" ]

