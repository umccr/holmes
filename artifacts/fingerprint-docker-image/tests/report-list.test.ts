import { reportList } from "../lib/report-list";

describe("Report List", () => {
  it("basic report", async () => {
    console.debug(
      await reportList([
        {
          url: "gds://asdadasd/ad/ad/ad/ad/ad/a/da/dasdasdad/as/da/da/dsads",
          lastModifiedMelbourne: "2020-03-02 10:23:50 AEST",
        },
        {
          url: "gds://rewerw/werw/rwr/wr/yt/rty/ryr/wr/wrw/rw/tr/yr/yr/yr/y",
          lastModifiedMelbourne: "2021-03-02 10:23:50 AEST",
        },
      ])
    );
  });
});
