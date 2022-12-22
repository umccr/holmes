FROM --platform=linux/amd64 brentp/somalier:v0.2.16 as somalier-real

# we are going to grab the compile somalier binary out of the docker image

FROM --platform=linux/amd64 public.ecr.aws/lambda/nodejs:18 AS lambda-builder

COPY package*.json ./
RUN npm ci

COPY *.ts ./
COPY lib/ ./lib/
COPY tsconfig.json ./

# esbuild doesn't do proper typechecking so we *should* do this proper Microsoft official compile to catch obvious errors
RUN npx tsc lambda-entry-check.ts lambda-entry-list.ts lambda-entry-pairs.ts fargate-entry-extract.ts --noEmit

# note: we bundle all the used node_modules into each output - so each CJS is about 1.5MB.. however the alternative
# of just leaving the node_modules folder actually adds about 20 MB to the image size - tree shaking works I guess!
RUN npx esbuild lambda-entry-check.ts --bundle --outfile=check.cjs --platform=node --target=node18
RUN npx esbuild lambda-entry-list.ts --bundle --outfile=list.cjs --platform=node --target=node18
RUN npx esbuild lambda-entry-pairs.ts --bundle --outfile=pairs.cjs --platform=node --target=node18
RUN npx esbuild fargate-entry-extract.ts --bundle --outfile=extract.cjs --platform=node --target=node18

FROM --platform=linux/amd64 public.ecr.aws/lambda/nodejs:18 AS lambda

COPY --from=somalier-real /usr/bin/somalier ./
COPY --from=lambda-builder /var/task/*.cjs ./

# the somalier build environment bakes this path into its libcurl - so symlink to our real certs
RUN ln -s /etc/ssl/certs/ca-bundle.crt /etc/ssl/certs/ca-certificates.crt

# the CMD must be set as part of the lambda definition or docker invoke.. we have no default
CMD [ "fail" ]

