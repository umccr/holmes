FROM --platform=linux/amd64 brentp/musl-hts-nim:v0.3.17 as somalier-builder

# Use the standard somalier docker build (keep checking this is kept up to date with the master on github)
# to build a static binary that executes in lambdas
# Note: we have pinned to a tagged git release of somalier to give build consistency - not for any particular
# dependency reasons.. so feel free to update to newer versions when they occur

RUN cd / &&    \
    git clone -b v0.2.15 --depth 5 https://github.com/brentp/somalier.git && \
    cd somalier && \
    nimble install -y nimble && \
    /root/.nimble/bin/nimble install -d -y

RUN cd /somalier &&  \
    nim c -d:danger -d:nsb_static -d:release -d:openmp -d:blas=openblas -d:lapack=openblas -o:/usr/bin/somalier src/somalier

FROM --platform=linux/amd64 public.ecr.aws/lambda/nodejs:16 AS lambda

COPY --from=somalier-builder /usr/bin/somalier ./

# the somalier build environment bakes this path into its libcurl - so symlink to our real certs
RUN ln -s /etc/ssl/certs/ca-bundle.crt /etc/ssl/certs/ca-certificates.crt

COPY package*.json ./
RUN npm install

# esbuild is lightning quick so it doesn't really matter that we do a full rebuild of
# these all every time any one of them changes
COPY *.ts ./
COPY lib/*.ts ./lib/

RUN npx esbuild lambda-entry-check.ts --bundle --outfile=check.cjs --platform=node --target=node16
RUN npx esbuild lambda-entry-check-start.ts --bundle --outfile=check-start.cjs --platform=node --target=node16

RUN npx esbuild lambda-entry-difference.ts --bundle --outfile=difference.cjs --platform=node --target=node16

RUN npx esbuild fargate-entry-extract.ts --bundle --outfile=extract.cjs --platform=node --target=node16

# the CMD must be set as part of the lambda definition or docker invoke.. we have no default
CMD [ "fail" ]
