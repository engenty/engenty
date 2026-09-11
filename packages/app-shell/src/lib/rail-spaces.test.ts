import { describe, expect, it } from "vitest";
import {
  isSpaceImageIcon,
  RAIL_SPACE_BUDGET,
  RAIL_SPACE_NO_STACK_MAX,
  railSpaceInitials,
  resolveRailSpaces,
  rollUpIndicators,
} from "./rail-spaces";

const space = (id: string, name = id) => ({ id, key: id, name });
const spaces = (count: number) =>
  Array.from({ length: count }, (_, index) => space(`s${index + 1}`));

const ids = (tiles: { id: string }[]) => tiles.map((tile) => tile.id);

describe("resolveRailSpaces", () => {
  it("shows every space when there are few enough to skip overflow", () => {
    const result = resolveRailSpaces({
      spaces: spaces(RAIL_SPACE_NO_STACK_MAX),
    });
    expect(result.visible).toHaveLength(RAIL_SPACE_NO_STACK_MAX);
    expect(result.hidden).toEqual([]);
    expect(result.hiddenTotal).toBe(0);
  });

  it("starts hiding one space past the no-overflow threshold", () => {
    const result = resolveRailSpaces({
      spaces: spaces(RAIL_SPACE_NO_STACK_MAX + 1),
    });
    expect(result.visible).toHaveLength(RAIL_SPACE_BUDGET);
    expect(result.hiddenTotal).toBe(
      RAIL_SPACE_NO_STACK_MAX + 1 - RAIL_SPACE_BUDGET
    );
  });

  it("puts the current space first even when it is outside the recency window", () => {
    // The case the "current space is topmost" rule exists for: you navigate to
    // a space you have not opened in months, and it must not be behind ⋯ on
    // the very screen you are looking at.
    const result = resolveRailSpaces({
      currentSpaceId: "s9",
      recent: ["s1", "s2", "s3"],
      spaces: [...spaces(8), space("s9")],
    });
    expect(ids(result.visible)).toEqual(["s9", "s1", "s2"]);
    expect(result.visible[0]?.isCurrent).toBe(true);
  });

  it("orders recents newest-first behind the current space", () => {
    const result = resolveRailSpaces({
      currentSpaceId: "s1",
      recent: ["s4", "s3", "s2"],
      spaces: spaces(6),
    });
    expect(ids(result.visible)).toEqual(["s1", "s4", "s3"]);
  });

  it("keeps the rail stable when switching to an already visible space", () => {
    const result = resolveRailSpaces({
      currentSpaceId: "s2",
      recent: ["s1", "s2", "s3"],
      spaces: spaces(6),
    });
    expect(ids(result.visible)).toEqual(["s1", "s2", "s3"]);
    expect(result.visible[1]?.isCurrent).toBe(true);
    expect(result.currentPromoted).toBe(false);
  });

  it("promotes the current space only when it was hidden", () => {
    const result = resolveRailSpaces({
      currentSpaceId: "s7",
      recent: ["s1", "s2", "s3"],
      spaces: spaces(7),
    });
    expect(ids(result.visible)).toEqual(["s7", "s1", "s2"]);
    expect(result.visible[0]?.isCurrent).toBe(true);
    expect(result.currentPromoted).toBe(true);
  });

  it("survives a duplicated id in the recency doc", () => {
    const result = resolveRailSpaces({
      recent: ["s2", "s2", "s3"],
      spaces: spaces(6),
    });
    expect(ids(result.visible)).toEqual(["s2", "s3", "s1"]);
  });

  it("skips a recency entry for a space that no longer exists", () => {
    // Deleting a space does not rewrite everyone's recency doc, so a dangling
    // id is a normal state, not a corrupt one.
    const result = resolveRailSpaces({
      recent: ["ghost", "s3"],
      spaces: spaces(6),
    });
    expect(ids(result.visible)).toEqual(["s3", "s1", "s2"]);
  });

  it("never renders a space twice", () => {
    const result = resolveRailSpaces({
      currentSpaceId: "s2",
      recent: ["s2", "s3"],
      spaces: spaces(9),
    });
    const all = [...ids(result.visible), ...ids(result.hidden)];
    expect(new Set(all).size).toBe(all.length);
  });

  it("keeps every additional space in the chooser list", () => {
    const total = RAIL_SPACE_BUDGET + 12;
    const result = resolveRailSpaces({ spaces: spaces(total) });
    expect(result.hidden).toHaveLength(total - RAIL_SPACE_BUDGET);
    expect(result.hiddenTotal).toBe(total - RAIL_SPACE_BUDGET);
  });

  it("rolls a hidden space's MENTION up onto the overflow control", () => {
    // The failure mode of overflow: a mention addressed to you personally must
    // not disappear because its space fell past the budget.
    const result = resolveRailSpaces({
      indicators: { s7: { mentions: 3, unread: true } },
      spaces: spaces(8),
    });
    expect(ids(result.visible)).not.toContain("s7");
    expect(result.stackIndicator.mentions).toBe(3);
    expect(result.stackIndicator.unread).toBe(true);
  });

  it("rolls activity up as a dot without inventing a count", () => {
    const result = resolveRailSpaces({
      indicators: { s6: { unread: true }, s7: { unread: true } },
      spaces: spaces(8),
    });
    expect(result.stackIndicator.unread).toBe(true);
    expect(result.stackIndicator.mentions).toBeUndefined();
  });

  it("leaves the overflow quiet when every hidden space is quiet", () => {
    const result = resolveRailSpaces({ spaces: spaces(8) });
    expect(result.stackIndicator).toEqual({});
  });

  it("renders the single tile on a one-space tenant", () => {
    // Hiding the zone would leave the concept invisible until a second space
    // appears — and then the rail restructures under the user.
    const result = resolveRailSpaces({ spaces: [space("only")] });
    expect(ids(result.visible)).toEqual(["only"]);
  });

  it("marks nothing current when the user is on a global app", () => {
    // A false "you are here" is worse than none.
    const result = resolveRailSpaces({
      currentSpaceId: null,
      spaces: spaces(3),
    });
    expect(result.visible.some((tile) => tile.isCurrent)).toBe(false);
  });

  it("returns empty for a tenant with no spaces", () => {
    const result = resolveRailSpaces({ spaces: [] });
    expect(result.visible).toEqual([]);
    expect(result.hidden).toEqual([]);
  });
});

describe("the personal space is pinned", () => {
  const personal = { ...space("me", "Alice"), isPersonal: true };

  it("keeps it first without promoting an already visible current space", () => {
    const result = resolveRailSpaces({
      currentSpaceId: "s2",
      spaces: [...spaces(3), personal],
    });
    expect(ids(result.visible)).toEqual(["me", "s1", "s2", "s3"]);
    expect(result.visible[2]?.isCurrent).toBe(true);
    expect(result.currentPromoted).toBe(false);
  });

  it("does not spend the budget, so no shared space is displaced by it", () => {
    // The failure this guards: acquiring a personal space silently pushes a space
    // you actually use off the rail and into the overflow chooser.
    const withoutPersonal = resolveRailSpaces({ spaces: spaces(6) });
    const withPersonal = resolveRailSpaces({
      spaces: [...spaces(6), personal],
    });
    expect(ids(withPersonal.visible)).toEqual([
      "me",
      ...ids(withoutPersonal.visible),
    ]);
    expect(withPersonal.hiddenTotal).toBe(withoutPersonal.hiddenTotal);
  });

  it("never lands in overflow, however many spaces there are", () => {
    const result = resolveRailSpaces({ spaces: [...spaces(40), personal] });
    expect(ids(result.visible)).toContain("me");
    expect(ids(result.hidden)).not.toContain("me");
  });

  it("renders once when it is also the current space", () => {
    const result = resolveRailSpaces({
      currentSpaceId: "me",
      spaces: [...spaces(3), personal],
    });
    expect(ids(result.visible).filter((id) => id === "me")).toHaveLength(1);
    expect(result.visible[0]?.isCurrent).toBe(true);
  });

  it("is not duplicated by a recency entry for itself", () => {
    const result = resolveRailSpaces({
      recent: ["me", "s2"],
      spaces: [...spaces(3), personal],
    });
    expect(ids(result.visible).filter((id) => id === "me")).toHaveLength(1);
    expect(ids(result.visible)).toEqual(["me", "s2", "s1", "s3"]);
  });

  it("changes nothing when no space is flagged personal", () => {
    // Every space that predates Phase P has no owner, so this is the upgrade
    // path: the rail must budget and order exactly as it did before.
    const result = resolveRailSpaces({
      currentSpaceId: "s4",
      spaces: spaces(6),
    });
    expect(result.visible).toHaveLength(RAIL_SPACE_BUDGET);
    expect(ids(result.visible)).toEqual(["s4", "s1", "s2"]);
    expect(result.hiddenTotal).toBe(3);
  });
});

describe("rollUpIndicators", () => {
  it("sums mentions and ORs activity", () => {
    expect(
      rollUpIndicators([
        { indicator: { mentions: 2 } },
        { indicator: { unread: true } },
        { indicator: {} },
      ])
    ).toEqual({ mentions: 2, unread: true });
  });
});

describe("railSpaceInitials", () => {
  it("takes one letter from each of the first two words", () => {
    expect(railSpaceInitials("Kunde Müller GmbH")).toBe("KM");
  });

  it("takes two letters from a single word", () => {
    expect(railSpaceInitials("Marketing")).toBe("MA");
  });

  it("never returns an empty label", () => {
    expect(railSpaceInitials("   ")).toBe("?");
  });
});

describe("isSpaceImageIcon", () => {
  it("recognises data URLs and http(s) images", () => {
    expect(isSpaceImageIcon("data:image/jpeg;base64,abc")).toBe(true);
    expect(isSpaceImageIcon("https://cdn.example/tile.png")).toBe(true);
    expect(isSpaceImageIcon("http://localhost/tile.png")).toBe(true);
  });

  it("leaves emoji and empty icons as glyphs", () => {
    expect(isSpaceImageIcon("🚀")).toBe(false);
    expect(isSpaceImageIcon(null)).toBe(false);
    expect(isSpaceImageIcon("")).toBe(false);
  });
});
