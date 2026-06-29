/**
 * Assembly-level tests for the tool_profile guard in assemble-workspace-agent.
 *
 * We test the profile filtering logic directly via the TOOL_PROFILE_ALLOWLISTS
 * map + CATALOG_META_TOOL_IDS, mirroring how assemble-workspace-agent applies
 * the guard, without spinning up a full Mastra agent.
 */
import { describe, expect, it } from "vitest";

import {
  CATALOG_META_TOOL_IDS,
  TOOL_PROFILE_ALLOWLISTS,
} from "../tool-profiles.js";

function applyProfileFilter(
  toolIds: string[],
  profile: keyof typeof TOOL_PROFILE_ALLOWLISTS | null
): string[] {
  if (profile === null) {
    return toolIds;
  }
  const allowlist = TOOL_PROFILE_ALLOWLISTS[profile];
  return toolIds.filter(
    (id) => allowlist.has(id) && !CATALOG_META_TOOL_IDS.has(id)
  );
}

describe("TOOL_PROFILE_ALLOWLISTS", () => {
  it("read_only_kb allowlist contains exactly the two KB tools", () => {
    const allowlist = TOOL_PROFILE_ALLOWLISTS.read_only_kb;
    expect(allowlist.has("knowledge_base_article_search")).toBe(true);
    expect(allowlist.has("kb_faqs_list")).toBe(true);
    expect(allowlist.size).toBe(2);
  });

  it("catalog meta-tools are not in the read_only_kb allowlist", () => {
    const allowlist = TOOL_PROFILE_ALLOWLISTS.read_only_kb;
    expect(allowlist.has("engenty_tools_search")).toBe(false);
    expect(allowlist.has("engenty_tool_execute")).toBe(false);
  });
});

describe("profile guard (mirrors assemble-workspace-agent logic)", () => {
  it("filters extra toolIds down to allowlist when profile is set", () => {
    const configToolIds = [
      "knowledge_base_article_search",
      "kb_faqs_list",
      "engenty_tools_search",
      "engenty_tool_execute",
      "web_search",
      "some_other_tool",
    ];
    const result = applyProfileFilter(configToolIds, "read_only_kb");
    expect(result).toEqual(
      expect.arrayContaining(["knowledge_base_article_search", "kb_faqs_list"])
    );
    expect(result).not.toContain("engenty_tools_search");
    expect(result).not.toContain("engenty_tool_execute");
    expect(result).not.toContain("web_search");
    expect(result).not.toContain("some_other_tool");
    expect(result).toHaveLength(2);
  });

  it("does not filter when profile is null (agent without a profile is unchanged)", () => {
    const configToolIds = [
      "engenty_tools_search",
      "engenty_tool_execute",
      "web_search",
    ];
    const result = applyProfileFilter(configToolIds, null);
    expect(result).toEqual(configToolIds);
  });
});
