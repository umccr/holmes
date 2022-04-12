import { argv } from "process";
import { extract } from "./extract";

(async () => {
  try {
    await extract(argv.slice(2));
  } catch (e) {
    console.log(e);

    process.exit(1);
  }
})();
