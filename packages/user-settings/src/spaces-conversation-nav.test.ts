import { describe, expect, it } from "vitest";
import {
  conversationItemKey,
  conversationNavForSpace,
  createConversationSection,
  deleteConversationSection,
  emptySpacesConversationNavDocument,
  foldAgentNavIntoConversationNav,
  hideConversation,
  isConversationHidden,
  parseConversationItem,
  parseSpacesConversationNavDocument,
  pinConversation,
  placeConversation,
  pruneSpacesConversationNav,
  renameConversationSection,
  SPACES_CONVERSATION_NAV_MAX_SECTIONS,
  setConversationItemOrder,
  setConversationSectionOrder,
  setPinnedConversationOrder,
  unhideConversation,
  unpinConversation,
} from "./spaces-conversation-nav.js";

const SPACE = "space-1";

describe("spaces conversation nav", () => {
  it("degrades an unreadable doc to null rather than throwing", () => {
    expect(parseSpacesConversationNavDocument({ v: 2 })).toBeNull();
    expect(parseSpacesConversationNavDocument("nope")).toBeNull();
    expect(parseSpacesConversationNavDocument(null)).toBeNull();
    expect(parseSpacesConversationNavDocument([])).toBeNull();
    expect(
      parseSpacesConversationNavDocument({
        spaces: { [SPACE]: { pinned: ["not-an-item"] } },
        v: 1,
      })
    ).toBeNull();
  });

  it("parses a v1 document", () => {
    const parsed = parseSpacesConversationNavDocument({
      spaces: {
        [SPACE]: {
          hidden: { "thread:t1": "2026-09-08T10:00:00.000Z" },
          itemOrder: { agents: ["agent:a"] },
          order: ["s1", "agents", "rooms", "dms"],
          pinned: ["thread:t2"],
          placement: { "agent:b": "s1" },
          sections: [{ id: "s1", name: "Relaunch" }],
        },
      },
      v: 1,
    });
    expect(parsed?.spaces[SPACE]?.sections).toEqual([
      { id: "s1", name: "Relaunch" },
    ]);
    expect(parsed?.spaces[SPACE]?.pinned).toEqual(["thread:t2"]);
  });

  it("builds and parses item keys", () => {
    expect(conversationItemKey("agent", "a")).toBe("agent:a");
    expect(parseConversationItem("thread:t:with:colons")).toEqual({
      id: "t:with:colons",
      kind: "thread",
    });
    expect(parseConversationItem("agent:")).toBeNull();
    expect(parseConversationItem("room:x")).toBeNull();
  });

  it("completes the section order with the built-ins on read", () => {
    const doc = emptySpacesConversationNavDocument();
    expect(conversationNavForSpace(doc, SPACE).order).toEqual([
      "agents",
      "rooms",
      "dms",
    ]);
    const reordered = setConversationSectionOrder(doc, SPACE, ["dms"]);
    expect(conversationNavForSpace(reordered, SPACE).order).toEqual([
      "dms",
      "agents",
      "rooms",
    ]);
  });

  it("pins to the end and takes the row out of every manual order", () => {
    let doc = emptySpacesConversationNavDocument();
    doc = setConversationItemOrder(doc, SPACE, "agents", [
      "agent:a",
      "agent:b",
      "agent:c",
    ]);
    doc = pinConversation(doc, SPACE, "agent:b");
    expect(conversationNavForSpace(doc, SPACE).itemOrder).toEqual({
      agents: ["agent:a", "agent:c"],
    });
    expect(conversationNavForSpace(doc, SPACE).pinned).toEqual(["agent:b"]);
    doc = pinConversation(doc, SPACE, "thread:t1");
    expect(conversationNavForSpace(doc, SPACE).pinned).toEqual([
      "agent:b",
      "thread:t1",
    ]);
  });

  it("unpins without restoring a manual position", () => {
    let doc = emptySpacesConversationNavDocument();
    doc = setConversationItemOrder(doc, SPACE, "agents", [
      "agent:a",
      "agent:b",
    ]);
    doc = pinConversation(doc, SPACE, "agent:a");
    doc = unpinConversation(doc, SPACE, "agent:a");
    expect(conversationNavForSpace(doc, SPACE).pinned).toEqual([]);
    expect(conversationNavForSpace(doc, SPACE).itemOrder).toEqual({
      agents: ["agent:b"],
    });
  });

  it("returns the same doc when a pin or unpin changes nothing", () => {
    const doc = pinConversation(
      emptySpacesConversationNavDocument(),
      SPACE,
      "agent:a"
    );
    expect(pinConversation(doc, SPACE, "agent:a")).toBe(doc);
    expect(unpinConversation(doc, SPACE, "agent:zzz")).toBe(doc);
    expect(pinConversation(doc, SPACE, "garbage")).toBe(doc);
  });

  it("places a row into a section, clears it, and ignores unknown sections", () => {
    let doc = emptySpacesConversationNavDocument();
    doc = createConversationSection(doc, SPACE, { id: "s1", name: "Relaunch" });
    doc = setConversationItemOrder(doc, SPACE, "agents", [
      "agent:a",
      "agent:b",
    ]);
    doc = placeConversation(doc, SPACE, "agent:a", "s1");
    expect(conversationNavForSpace(doc, SPACE).placement).toEqual({
      "agent:a": "s1",
    });
    expect(conversationNavForSpace(doc, SPACE).itemOrder).toEqual({
      agents: ["agent:b"],
    });
    expect(placeConversation(doc, SPACE, "agent:a", "s1")).toBe(doc);
    expect(placeConversation(doc, SPACE, "agent:a", "nope")).toBe(doc);

    doc = placeConversation(doc, SPACE, "agent:a", null);
    expect(conversationNavForSpace(doc, SPACE).placement).toEqual({});
    expect(placeConversation(doc, SPACE, "agent:a", null)).toBe(doc);
  });

  it("placing a pinned row keeps it pinned", () => {
    let doc = emptySpacesConversationNavDocument();
    doc = createConversationSection(doc, SPACE, { id: "s1", name: "Relaunch" });
    doc = pinConversation(doc, SPACE, "thread:t1");
    doc = placeConversation(doc, SPACE, "thread:t1", "s1");
    const slice = conversationNavForSpace(doc, SPACE);
    expect(slice.pinned).toEqual(["thread:t1"]);
    expect(slice.placement).toEqual({ "thread:t1": "s1" });
  });

  it("hides until the next message", () => {
    const hiddenAt = "2026-09-08T10:00:00.000Z";
    let doc = emptySpacesConversationNavDocument();
    doc = hideConversation(doc, SPACE, "thread:t1", hiddenAt);
    expect(hideConversation(doc, SPACE, "thread:t1", hiddenAt)).toBe(doc);
    const slice = conversationNavForSpace(doc, SPACE);
    expect(isConversationHidden(slice, "thread:t1", hiddenAt)).toBe(true);
    expect(
      isConversationHidden(slice, "thread:t1", "2026-09-08T09:59:59.999Z")
    ).toBe(true);
    expect(
      isConversationHidden(slice, "thread:t1", "2026-09-08T10:00:00.001Z")
    ).toBe(false);
    expect(isConversationHidden(slice, "thread:t1", null)).toBe(true);
    expect(isConversationHidden(slice, "thread:t2", hiddenAt)).toBe(false);

    doc = unhideConversation(doc, SPACE, "thread:t1");
    expect(conversationNavForSpace(doc, SPACE).hidden).toEqual({});
    expect(unhideConversation(doc, SPACE, "thread:t1")).toBe(doc);
  });

  it("creates personal sections above the built-ins", () => {
    let doc = emptySpacesConversationNavDocument();
    doc = createConversationSection(doc, SPACE, {
      id: "s1",
      name: " Relaunch ",
    });
    doc = createConversationSection(doc, SPACE, { id: "s2", name: "Pricing" });
    const slice = conversationNavForSpace(doc, SPACE);
    expect(slice.sections).toEqual([
      { id: "s1", name: "Relaunch" },
      { id: "s2", name: "Pricing" },
    ]);
    expect(slice.order).toEqual(["s1", "s2", "agents", "rooms", "dms"]);
  });

  it("rejects empty names, duplicate ids, built-in ids and the 21st section", () => {
    let doc = emptySpacesConversationNavDocument();
    doc = createConversationSection(doc, SPACE, { id: "s1", name: "Relaunch" });
    expect(
      createConversationSection(doc, SPACE, { id: "s2", name: "  " })
    ).toBe(doc);
    expect(
      createConversationSection(doc, SPACE, { id: "s1", name: "Again" })
    ).toBe(doc);
    expect(
      createConversationSection(doc, SPACE, { id: "rooms", name: "Mine" })
    ).toBe(doc);

    for (
      let index = 2;
      index <= SPACES_CONVERSATION_NAV_MAX_SECTIONS;
      index++
    ) {
      doc = createConversationSection(doc, SPACE, {
        id: `s${index}`,
        name: `Section ${index}`,
      });
    }
    expect(conversationNavForSpace(doc, SPACE).sections).toHaveLength(
      SPACES_CONVERSATION_NAV_MAX_SECTIONS
    );
    expect(
      createConversationSection(doc, SPACE, { id: "overflow", name: "No" })
    ).toBe(doc);
  });

  it("renames personal sections only", () => {
    let doc = emptySpacesConversationNavDocument();
    doc = createConversationSection(doc, SPACE, { id: "s1", name: "Relaunch" });
    doc = renameConversationSection(doc, SPACE, "s1", " Website ");
    expect(conversationNavForSpace(doc, SPACE).sections).toEqual([
      { id: "s1", name: "Website" },
    ]);
    expect(renameConversationSection(doc, SPACE, "s1", "Website")).toBe(doc);
    expect(renameConversationSection(doc, SPACE, "s1", "")).toBe(doc);
    expect(renameConversationSection(doc, SPACE, "agents", "Leute")).toBe(doc);
    expect(renameConversationSection(doc, SPACE, "missing", "X")).toBe(doc);
  });

  it("deletes a section and lets its rows fall back to their kind", () => {
    let doc = emptySpacesConversationNavDocument();
    doc = createConversationSection(doc, SPACE, { id: "s1", name: "Relaunch" });
    doc = createConversationSection(doc, SPACE, { id: "s2", name: "Pricing" });
    doc = placeConversation(doc, SPACE, "agent:a", "s1");
    doc = placeConversation(doc, SPACE, "thread:t1", "s2");
    doc = setConversationItemOrder(doc, SPACE, "s1", ["agent:a"]);
    doc = deleteConversationSection(doc, SPACE, "s1");
    const slice = conversationNavForSpace(doc, SPACE);
    expect(slice.sections).toEqual([{ id: "s2", name: "Pricing" }]);
    expect(slice.order).toEqual(["s2", "agents", "rooms", "dms"]);
    expect(slice.placement).toEqual({ "thread:t1": "s2" });
    expect(slice.itemOrder).toEqual({});
    expect(deleteConversationSection(doc, SPACE, "s1")).toBe(doc);
    expect(deleteConversationSection(doc, SPACE, "agents")).toBe(doc);
  });

  it("sets the section order and completes what is missing", () => {
    let doc = emptySpacesConversationNavDocument();
    doc = createConversationSection(doc, SPACE, { id: "s1", name: "A" });
    doc = createConversationSection(doc, SPACE, { id: "s2", name: "B" });
    doc = setConversationSectionOrder(doc, SPACE, [
      "rooms",
      "unknown",
      "s2",
      "rooms",
    ]);
    expect(conversationNavForSpace(doc, SPACE).order).toEqual([
      "rooms",
      "s2",
      "agents",
      "dms",
      "s1",
    ]);
    expect(
      setConversationSectionOrder(doc, SPACE, [
        "rooms",
        "s2",
        "agents",
        "dms",
        "s1",
      ])
    ).toBe(doc);
  });

  it("orders items inside a section, dropping pinned rows", () => {
    let doc = emptySpacesConversationNavDocument();
    doc = pinConversation(doc, SPACE, "agent:p");
    doc = setConversationItemOrder(doc, SPACE, "agents", [
      "agent:b",
      "agent:p",
      "agent:a",
      "agent:b",
      "junk",
    ]);
    expect(conversationNavForSpace(doc, SPACE).itemOrder).toEqual({
      agents: ["agent:b", "agent:a"],
    });
    expect(
      setConversationItemOrder(doc, SPACE, "agents", ["agent:b", "agent:a"])
    ).toBe(doc);
    expect(setConversationItemOrder(doc, SPACE, "nope", ["agent:a"])).toBe(doc);
    doc = setConversationItemOrder(doc, SPACE, "agents", []);
    expect(conversationNavForSpace(doc, SPACE).itemOrder).toEqual({});
  });

  it("sets the pinned order in full", () => {
    let doc = emptySpacesConversationNavDocument();
    doc = setConversationItemOrder(doc, SPACE, "rooms", [
      "thread:t1",
      "thread:t2",
    ]);
    doc = setPinnedConversationOrder(doc, SPACE, ["thread:t2", "agent:a"]);
    const slice = conversationNavForSpace(doc, SPACE);
    expect(slice.pinned).toEqual(["thread:t2", "agent:a"]);
    expect(slice.itemOrder).toEqual({ rooms: ["thread:t1"] });
    expect(
      setPinnedConversationOrder(doc, SPACE, ["thread:t2", "agent:a"])
    ).toBe(doc);
  });

  it("prunes rows that are gone and keeps the doc when nothing is", () => {
    let doc = emptySpacesConversationNavDocument();
    doc = createConversationSection(doc, SPACE, { id: "s1", name: "A" });
    doc = pinConversation(doc, SPACE, "agent:keep");
    doc = pinConversation(doc, SPACE, "agent:gone");
    doc = placeConversation(doc, SPACE, "thread:keep", "s1");
    doc = placeConversation(doc, SPACE, "thread:gone", "s1");
    doc = setConversationItemOrder(doc, SPACE, "s1", [
      "thread:gone",
      "thread:keep",
    ]);
    doc = hideConversation(doc, SPACE, "thread:gone", "2026-09-08T10:00:00Z");
    doc = hideConversation(doc, SPACE, "thread:keep", "2026-09-08T10:00:00Z");
    const known = ["agent:keep", "thread:keep"] as const;
    doc = pruneSpacesConversationNav(doc, SPACE, known);
    const slice = conversationNavForSpace(doc, SPACE);
    expect(slice.pinned).toEqual(["agent:keep"]);
    expect(slice.placement).toEqual({ "thread:keep": "s1" });
    expect(slice.itemOrder).toEqual({ s1: ["thread:keep"] });
    expect(slice.hidden).toEqual({ "thread:keep": "2026-09-08T10:00:00Z" });
    expect(slice.sections).toEqual([{ id: "s1", name: "A" }]);
    expect(pruneSpacesConversationNav(doc, SPACE, known)).toBe(doc);
  });

  it("folds the agent nav in once", () => {
    let doc = emptySpacesConversationNavDocument();
    doc = foldAgentNavIntoConversationNav(doc, SPACE, {
      order: ["b", "c", "a"],
      pinned: ["a"],
    });
    const slice = conversationNavForSpace(doc, SPACE);
    expect(slice.pinned).toEqual(["agent:a"]);
    expect(slice.itemOrder).toEqual({ agents: ["agent:b", "agent:c"] });

    const again = foldAgentNavIntoConversationNav(doc, SPACE, {
      order: ["z"],
      pinned: ["y"],
    });
    expect(again).toBe(doc);
    expect(
      foldAgentNavIntoConversationNav(
        emptySpacesConversationNavDocument(),
        SPACE,
        {
          order: [],
          pinned: [],
        }
      )
    ).toEqual(emptySpacesConversationNavDocument());
  });

  it("leaves another space's nav untouched", () => {
    let doc = emptySpacesConversationNavDocument();
    doc = pinConversation(doc, SPACE, "agent:a");
    doc = pinConversation(doc, "space-2", "agent:b");
    doc = pruneSpacesConversationNav(doc, SPACE, []);
    expect(conversationNavForSpace(doc, SPACE).pinned).toEqual([]);
    expect(conversationNavForSpace(doc, "space-2").pinned).toEqual(["agent:b"]);
  });
});
