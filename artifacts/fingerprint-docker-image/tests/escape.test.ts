import { safeS3Escape, safeS3Unescape } from "../lib/escape";

xdescribe("Experimental escaping algorithm WIP", () => {
  it("escape", async () => {
    console.debug(safeS3Escape("s3://bucket-name/blah-blah.bam"));
  });

  it("unescape", async () => {
    console.debug(safeS3Unescape("s3_3a_2f_2fbucket-name_2fblah-blah.bam"));
  });
});
