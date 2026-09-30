import { describe, expect, it } from "vitest";
import { connectorPrefixesForAgent, isAccountReachableInRun } from "./reach.js";

const marketing = {
  id: "c-marketing",
  owner_user_id: null,
  space_id: "space-marketing",
};
const annasMail = { id: "c-anna", owner_user_id: "user-anna", space_id: null };

const noOne = { personalUserId: null, spaceId: null };

describe("isAccountReachableInRun", () => {
  it("reaches a Space account only in the Space that owns it", () => {
    expect(
      isAccountReachableInRun({
        connection: marketing,
        reach: { ...noOne, spaceId: "space-marketing" },
      })
    ).toBe(true);
    expect(
      isAccountReachableInRun({
        connection: marketing,
        reach: { ...noOne, spaceId: "space-sales" },
      })
    ).toBe(false);
  });

  it("never reaches a Space account through a person", () => {
    expect(
      isAccountReachableInRun({
        connection: marketing,
        reach: { personalUserId: "user-anna", spaceId: null },
      })
    ).toBe(false);
  });

  it("reaches a personal account for its owner in any Space or none", () => {
    for (const spaceId of ["space-marketing", "space-sales", null]) {
      expect(
        isAccountReachableInRun({
          connection: annasMail,
          reach: { personalUserId: "user-anna", spaceId },
        })
      ).toBe(true);
    }
  });

  it("never reaches a personal account for anyone else or without a person", () => {
    expect(
      isAccountReachableInRun({
        connection: annasMail,
        reach: { personalUserId: "user-ben", spaceId: "space-marketing" },
      })
    ).toBe(false);
    expect(
      isAccountReachableInRun({
        connection: annasMail,
        reach: { personalUserId: null, spaceId: "space-marketing" },
      })
    ).toBe(false);
  });

  it("reaches nothing when the call names no Space and no person", () => {
    for (const blank of [null, "", "  "]) {
      const reach = { personalUserId: blank, spaceId: blank };
      expect(isAccountReachableInRun({ connection: marketing, reach })).toBe(
        false
      );
      expect(isAccountReachableInRun({ connection: annasMail, reach })).toBe(
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
