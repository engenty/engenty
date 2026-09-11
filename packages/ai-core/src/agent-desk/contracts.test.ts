import { describe, expect, it } from "vitest";
import {
  agentDeskCapabilityChips,
  formatAgentDeskCapabilityLabel,
} from "./contracts.js";

describe("formatAgentDeskCapabilityLabel", () => {
  it("title-cases hyphenated ids", () => {
    expect(formatAgentDeskCapabilityLabel("contacts-search")).toBe(
      "Contacts Search"
    );
    expect(formatAgentDeskCapabilityLabel("google-gmail")).toBe("Google Gmail");
  });
});

describe("agentDeskCapabilityChips", () => {
  it("dedupes, trims, and skips blanks", () => {
    expect(
      agentDeskCapabilityChips([
        " contacts-search ",
        "contacts-search",
        "",
        " ",
      ])
    ).toEqual([{ id: "contacts-search", label: "Contacts Search" }]);
  });
});
