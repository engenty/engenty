import { describe, expect, it } from "vitest";
import { matchDeskAgent } from "./use-agent-desk-slash-commands.js";

const agents = [
  { id: "a-sales", name: "Sales" },
  { id: "a-sales-ops", name: "Sales Ops" },
  { id: "a-support", name: "Support" },
  { id: "a-books", name: "Bookkeeping" },
];

describe("matchDeskAgent", () => {
  it("takes a full name over another agent it prefixes", () => {
    expect(matchDeskAgent(agents, "sales")?.id).toBe("a-sales");
  });

  it("opens the one agent a partial name points at", () => {
    expect(matchDeskAgent(agents, "supp")?.id).toBe("a-support");
    expect(matchDeskAgent(agents, "keep")?.id).toBe("a-books");
    expect(matchDeskAgent(agents, "a-sales-ops")?.id).toBe("a-sales-ops");
  });

  it("refuses to guess when a name fits several agents or none", () => {
    expect(matchDeskAgent(agents, "s")).toBeNull();
    expect(matchDeskAgent(agents, "marketing")).toBeNull();
    expect(matchDeskAgent(agents, "  ")).toBeNull();
  });
});
