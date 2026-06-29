import { describe, expect, it } from "vitest";
import { buildSkillSummary, parseSkillMarkdown } from "../skill-frontmatter.js";

describe("skill frontmatter summary", () => {
  it("extracts catalog metadata from frontmatter and body", () => {
    const summary = buildSkillSummary(
      "report-builder",
      "custom",
      parseSkillMarkdown(`---
name: report-builder
description: Build reports from module data.
allowed-tools: engenty_tool_execute mastra_workspace_execute_command
metadata:
  modules: contacts, tasks
engenty:
  source: skills_sh
---

# Report builder

Write scripts under /sandbox and run them for analysis.
`)
    );

    expect(summary.allowed_tools).toEqual([
      "engenty_tool_execute",
      "mastra_workspace_execute_command",
    ]);
    expect(summary.engenty_modules).toEqual(["contacts", "tasks"]);
    expect(summary.requires_sandbox).toBe(true);
    expect(summary.source).toBe("skills_sh");
  });

  it("uses managed provenance as the module when no metadata module is declared", () => {
    const summary = buildSkillSummary(
      "contacts-search",
      "managed",
      parseSkillMarkdown(`---
name: contacts-search
description: Find contacts.
engenty:
  source: contacts
---

# Contacts search
`)
    );

    expect(summary.engenty_modules).toEqual(["contacts"]);
    expect(summary.requires_sandbox).toBe(false);
  });
});
