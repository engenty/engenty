import { describe, expect, it } from "vitest";
import {
  agentNavForSpace,
  emptySpacesAgentNavDocument,
  parseSpacesAgentNavDocument,
  pinSpaceAgent,
  pruneSpacesAgentNav,
  setSpaceAgentPinnedOrder,
  setSpaceAgentUnpinnedOrder,
  unpinSpaceAgent,
} from "./spaces-agent-nav.js";

describe("spaces agent nav", () => {
  it("degrades an unreadable doc to null rather than throwing", () => {
    expect(parseSpacesAgentNavDocument({ v: 2 })).toBeNull();
    expect(parseSpacesAgentNavDocument("nope")).toBeNull();
    expect(parseSpacesAgentNavDocument(null)).toBeNull();
  });

  it("parses a v1 document", () => {
    const parsed = parseSpacesAgentNavDocument({
      spaces: {
        "space-1": { order: ["b"], pinned: ["a"] },
      },
      v: 1,
    });
    expect(parsed?.spaces["space-1"]).toEqual({
      order: ["b"],
      pinned: ["a"],
    });
  });

  it("pins to the end and removes the id from unpinned order", () => {
    let doc = emptySpacesAgentNavDocument();
    doc = setSpaceAgentUnpinnedOrder(doc, "space-1", ["a", "b", "c"]);
    doc = pinSpaceAgent(doc, "space-1", "b");
    expect(agentNavForSpace(doc, "space-1")).toEqual({
      order: ["a", "c"],
      pinned: ["b"],
    });
    doc = pinSpaceAgent(doc, "space-1", "a");
    expect(agentNavForSpace(doc, "space-1").pinned).toEqual(["b", "a"]);
  });

  it("unpins into the end of unpinned order", () => {
    let doc = emptySpacesAgentNavDocument();
    doc = pinSpaceAgent(doc, "space-1", "a");
    doc = setSpaceAgentUnpinnedOrder(doc, "space-1", ["b"]);
    doc = unpinSpaceAgent(doc, "space-1", "a");
    expect(agentNavForSpace(doc, "space-1")).toEqual({
      order: ["b", "a"],
      pinned: [],
    });
  });

  it("reorders pins without changing unpinned order", () => {
    let doc = emptySpacesAgentNavDocument();
    doc = setSpaceAgentPinnedOrder(doc, "space-1", ["a", "b"]);
    doc = setSpaceAgentUnpinnedOrder(doc, "space-1", ["c"]);
    doc = setSpaceAgentPinnedOrder(doc, "space-1", ["b", "a"]);
    expect(agentNavForSpace(doc, "space-1")).toEqual({
      order: ["c"],
      pinned: ["b", "a"],
    });
  });

  it("drops ids that left the roster", () => {
    let doc = emptySpacesAgentNavDocument();
    doc = setSpaceAgentPinnedOrder(doc, "space-1", ["keep", "gone"]);
    doc = setSpaceAgentUnpinnedOrder(doc, "space-1", ["also-keep", "gone-too"]);
    doc = pruneSpacesAgentNav(doc, "space-1", ["keep", "also-keep"]);
    expect(agentNavForSpace(doc, "space-1")).toEqual({
      order: ["also-keep"],
      pinned: ["keep"],
    });
  });

  it("leaves another space's nav untouched", () => {
    let doc = emptySpacesAgentNavDocument();
    doc = pinSpaceAgent(doc, "space-1", "a");
    doc = pinSpaceAgent(doc, "space-2", "b");
    doc = pruneSpacesAgentNav(doc, "space-1", []);
    expect(agentNavForSpace(doc, "space-1").pinned).toEqual([]);
    expect(agentNavForSpace(doc, "space-2").pinned).toEqual(["b"]);
  });
});
