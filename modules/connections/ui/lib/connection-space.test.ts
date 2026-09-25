import { describe, expect, it } from "vitest";
import { connectionsInSpace, findPersonalSpace } from "./connection-space";

const spaces = [
  { id: "team", key: "team", name: "Team", ownerUserId: null },
  { id: "mine", key: "me", name: "Me", ownerUserId: "u1" },
];

describe("connection-space", () => {
  it("finds the viewer's personal Space", () => {
    expect(findPersonalSpace(spaces, "u1")?.id).toBe("mine");
    expect(findPersonalSpace(spaces, "u2")).toBeNull();
    expect(findPersonalSpace(spaces, null)).toBeNull();
  });

  it("keeps only the accounts of one Space", () => {
    const rows = [
      { id: "a", space_id: "team" },
      { id: "b", space_id: "mine" },
    ];
    expect(connectionsInSpace(rows, "mine").map((row) => row.id)).toEqual([
      "b",
    ]);
    expect(connectionsInSpace(rows, null)).toEqual([]);
  });
});
