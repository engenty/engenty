import { describe, expect, it } from "vitest";
import {
  assertStrictToolId,
  normalizeLegacyToolId,
  STRICT_TOOL_ID_PATTERN,
} from "./tool-id.js";

describe("normalizeLegacyToolId", () => {
  it("converts simple module.action ids", () => {
    expect(normalizeLegacyToolId("contacts.list")).toBe("contacts_list");
    expect(normalizeLegacyToolId("kb.list")).toBe("kb_list");
  });

  it("converts nested entity and camelCase actions", () => {
    expect(normalizeLegacyToolId("contacts.contact.search")).toBe(
      "contacts_contact_search"
    );
    expect(normalizeLegacyToolId("contacts.linkedin.getProfile")).toBe(
      "contacts_linkedin_get_profile"
    );
    expect(normalizeLegacyToolId("knowledge-base.article.search")).toBe(
      "knowledge_base_article_search"
    );
  });

  it("converts team module dotted ids", () => {
    expect(normalizeLegacyToolId("team.list")).toBe("team_list");
    expect(normalizeLegacyToolId("team.time-tracking.listCatalog")).toBe(
      "team_time_tracking_list_catalog"
    );
  });

  it("converts frontend tool names", () => {
    expect(normalizeLegacyToolId("shell.setTheme")).toBe("shell_set_theme");
    expect(normalizeLegacyToolId("contacts.applyDraftPatch")).toBe(
      "contacts_apply_draft_patch"
    );
  });
});

describe("assertStrictToolId", () => {
  it("accepts strict ids", () => {
    expect(STRICT_TOOL_ID_PATTERN.test("team_list")).toBe(true);
    expect(() => assertStrictToolId("contacts_list")).not.toThrow();
  });

  it("rejects dotted ids", () => {
    expect(() => assertStrictToolId("contacts.list")).toThrow(/Invalid/);
    expect(() => assertStrictToolId("team.list")).toThrow(/Invalid/);
  });
});
