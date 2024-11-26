FROM --platform=linux/amd64 brentp/somalier:v0.2.19 AS somalier-real

# we are going to grab the compiled somalier binary out of the docker image (our linux bases
# between our different layers are compatible enough for this to work)

# we have to force a platform of linux/amd64 because somalier only builds for that arch (as of 0.2.19)

FROM --platform=linux/amd64 public.ecr.aws/lambda/nodejs:22 AS lambda-builder

COPY package*.json ./
RUN npm ci

COPY *.ts ./
COPY lib/ ./lib/
COPY tsconfig.json ./

# esbuild doesn't do proper typechecking so we *should* do this proper Microsoft official compile to catch obvious errors
RUN npx tsc --noEmit

# note: we bundle all the used node_modules into each output - so each CJS is about 2MB.. however the alternative
# of just leaving the node_modules folder actually adds about 20 MB to the image size - tree shaking works I guess!

RUN npx esbuild lambda-entry-list.ts --bundle --outfile=list.cjs --platform=node --target=node20
RUN npx esbuild lambda-entry-relate.ts --bundle --outfile=relate.cjs --platform=node --target=node20
RUN npx esbuild lambda-entry-control.ts --bundle --outfile=control.cjs --platform=node --target=node20

# check is both an invokable lambda AND a steps AND a lambda executed in the steps
RUN npx esbuild lambda-entry-check.ts --bundle --outfile=check.cjs --platform=node --target=node20
RUN npx esbuild lambda-entry-step-check.ts --bundle --outfile=step-check.cjs --platform=node --target=node20

# the extractor
RUN npx esbuild fargate-entry-extract.ts --bundle --outfile=extract.cjs --platform=node --target=node20

RUN npx esbuild lambda-entry-scheduler-event.ts --bundle --outfile=scheduler-event.cjs --platform=node --target=node20
RUN npx esbuild lambda-entry-slack-command.ts --bundle --outfile=slack-command.cjs --platform=node --target=node20

FROM --platform=linux/amd64 public.ecr.aws/lambda/nodejs:22 AS lambda

COPY --from=somalier-real /usr/bin/somalier ./
COPY --from=lambda-builder /var/task/*.cjs ./

# the CMD must be set as part of the lambda definition or docker invoke.. we have no default
CMD [ "fail" ]
