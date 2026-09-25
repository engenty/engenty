import { describe, expect, it } from "vitest";
import { connectorPrefixesForAgent, isAccountReachableInRun } from "./reach.js";

const marketing = { id: "c-marketing", space_id: "space-marketing" };

describe("isAccountReachableInRun", () => {
  it("reaches an account only in the Space that owns it", () => {
    expect(
      isAccountReachableInRun({
        connection: marketing,
        spaceId: "space-marketing",
      })
    ).toBe(true);
    expect(
      isAccountReachableInRun({ connection: marketing, spaceId: "space-sales" })
    ).toBe(false);
  });

  it("reaches nothing when the run names no Space", () => {
    for (const spaceId of [null, undefined, "", "  "]) {
      expect(isAccountReachableInRun({ connection: marketing, spaceId })).toBe(
        false
      );
    }
  });
});

describe("connectorPrefixesForAgent", () => {
  it("empty preferred list is everything the Space offers", () => {
    expect(
      connectorPrefixesForAgent({
        preferredPrefixes: new Set(),
        spacePrefixes: new Set(["gcal", "gmail"]),
      })
    ).toEqual(new Set(["gcal", "gmail"]));
  });

  it("a preferred list narrows the Space and never adds to it", () => {
    expect(
      connectorPrefixesForAgent({
        preferredPrefixes: new Set(["gcal", "slack"]),
        spacePrefixes: new Set(["gcal", "gdrive"]),
      })
    ).toEqual(new Set(["gcal"]));
  });
});
