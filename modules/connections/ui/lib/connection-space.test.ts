import { describe, expect, it } from "vitest";
import { connectionsInSpace } from "./connection-space";

describe("connectionsInSpace", () => {
  const rows = [
    { id: "a", space_id: "marketing" },
    { id: "b", space_id: "sales" },
    { id: "mine", space_id: null },
  ];

  it("keeps one Space's accounts, or the viewer's own for null", () => {
    expect(connectionsInSpace(rows, "marketing").map((row) => row.id)).toEqual([
      "a",
    ]);
    expect(connectionsInSpace(rows, null).map((row) => row.id)).toEqual([
      "mine",
    ]);
  });
});
