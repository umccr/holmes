FROM brentp/musl-hts-nim:v0.3.17 as somalier-builder

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

FROM public.ecr.aws/lambda/nodejs:14

COPY --from=somalier-builder /usr/bin/somalier ./

COPY package*.json ./
RUN npm install

# esbuild is lightning quick so it doesn't really matter that we do a full rebuild of
# these all every time any one of them changes
COPY *.ts ./
RUN npx esbuild check.ts --bundle --outfile=check.cjs --platform=node --target=node14
RUN npx esbuild gather.ts --bundle --outfile=gather.cjs --platform=node --target=node14

# Disabled - this was just a proof of concept - but is not feasible in the 15 mins lambda limit
# inside the docker build we expect this to have a generic name - but this is likely to have been sourced
# from something like sites.hg38.rna.vcf.gz as part of the CI build
# for local build/test just put any suitable file from brentp/somalier release
# COPY sites.vcf.gz ./
# COPY extract.ts ./
# RUN npx esbuild extract.ts --bundle --outfile=extract.cjs --platform=node --target=node14

# the CMD must be set as part of the lambda definition or docker invoke.. we have no default
CMD [ "fail" ]
