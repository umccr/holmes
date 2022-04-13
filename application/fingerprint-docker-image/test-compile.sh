
# because we use esbuild for the docker image (which doesn't enforce types) - it is occasionally
# useful to allow the compiler to really have a go at the source and do full typescript checks
npx tsc --noEmit ./*.ts

