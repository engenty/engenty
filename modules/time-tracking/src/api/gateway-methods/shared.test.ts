import { describe, expect, it } from "vitest";
import { mapTeamCatalogRows } from "./shared.js";

describe("mapTeamCatalogRows", () => {
  it("uses linked user id when present and profile id otherwise", () => {
    expect(
      mapTeamCatalogRows([
        { id: "m1", full_name: "Member One", user_id: "user-1" },
        { id: "m2", full_name: "Member Two", user_id: null },
      ])
    ).toEqual([
      { id: "user-1", full_name: "Member One", user_id: "user-1" },
      { id: "m2", full_name: "Member Two", user_id: null },
    ]);
  });

  it("drops rows without id or name", () => {
    expect(
      mapTeamCatalogRows([
        { id: "", full_name: "Missing id", user_id: null },
        { id: "m3", full_name: "  ", user_id: null },
      ])
    ).toEqual([]);
  });
});
