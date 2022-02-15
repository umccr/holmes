FROM brentp/musl-hts-nim:v0.3.4 as somalier-builder

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

COPY check.ts ./
RUN npx esbuild check.ts --bundle --outfile=check.cjs --platform=node --target=node14

COPY gather.ts ./
RUN npx esbuild gather.ts --bundle --outfile=gather.cjs --platform=node --target=node14

CMD [ "" ]
