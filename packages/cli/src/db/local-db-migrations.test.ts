import { describe, expect, it } from "vitest";
import { parseMigrationRows } from "../db/local-db.js";

describe("parseMigrationRows", () => {
  it("reads the JSON shape", () => {
    expect(
      parseMigrationRows(
        'Connecting to local database...\n{"migrations":[{"local":"1","remote":"1"},{"local":"2","remote":""}]}'
      )
    ).toEqual([
      { local: "1", remote: "1" },
      { local: "2", remote: "" },
    ]);
  });

  // The CLI falls back to its markdown table when it does not like the
  // terminal; a pending migration has an empty Remote cell.
  it("reads the markdown table shape", () => {
    const table = [
      "   Local            | Remote           | Time (UTC)",
      "  ------------------|------------------|-----------",
      "   `20260616000300` | `20260616000300` | `2026-06-16 00:03:00`",
      "   `20260911120000` |                  | `2026-09-11 12:00:00`",
    ].join("\n");
    expect(parseMigrationRows(table)).toEqual([
      { local: "20260616000300", remote: "20260616000300" },
      { local: "20260911120000", remote: undefined },
    ]);
  });
});
