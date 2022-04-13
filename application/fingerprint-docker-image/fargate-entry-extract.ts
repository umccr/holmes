import { argv } from "process";
import { extract } from "./lib/extract";

(async () => {
  try {
    await extract(argv.slice(2));
  } catch (e) {
    console.log(e);

    process.exit(1);
  }
})();
