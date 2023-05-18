FROM --platform=linux/amd64 public.ecr.aws/lambda/nodejs:18

COPY package* ./
RUN npm ci

COPY *.ts ./
COPY lib/ ./lib/
COPY tsconfig.json ./

# esbuild doesn't do proper typechecking so we *should* do this proper Microsoft official compile to catch obvious errors
RUN npx tsc --noEmit

RUN npx esbuild --bundle entrypoint-event-lambda.ts --platform=node --outfile=entrypoint-event-lambda.cjs --target=node18
RUN npx esbuild --bundle entrypoint-slack-command-lambda.ts --platform=node --outfile=entrypoint-slack-command-lambda.cjs --target=node18

# we deliberately specify no default CMD so that any deploying infrastructure
# MUST make its own decision as to which entrypoint they want
# e.g. CMD [ "entrypoint-event-lambda.handler"] (but is specified in the CDK Docker function)
