import { describe, expect, it } from "vitest";
import {
  humanizeToolId,
  resolveToolAdminDescription,
} from "./tool-admin-descriptions";

describe("humanizeToolId", () => {
  it("handles kebab-case and snake_case", () => {
    expect(humanizeToolId("create-inbox-item")).toBe("Create Inbox Item");
    expect(humanizeToolId("web_search")).toBe("Web Search");
  });
});

describe("resolveToolAdminDescription", () => {
  it("uses catalog strings when present", () => {
    expect(resolveToolAdminDescription("web_search")).toContain("web search");
    expect(resolveToolAdminDescription("search-kb")).toContain("embedding");
    expect(resolveToolAdminDescription("update-article")).toContain("Patch");
  });
});
