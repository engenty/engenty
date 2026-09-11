import { describe, expect, it } from "vitest";
import {
  matchesSkillsFindOutput,
  parseSkillsFindOutput,
} from "./skills-find-output.js";

const payload = {
  attach: {
    agent: { can_prefer: false, id: "engenty.copilot" },
    space: { id: "space-1" },
  },
  ok: true,
  provider: { id: "skills_sh", label: "skills.sh" },
  query: "pr review",
  results: [
    {
      already_in_space: false,
      already_installed: false,
      already_preferred: false,
      description: "Review pull requests.",
      name: "pr-review",
      ref: { id: "acme/skills/pr-review" },
      url: "https://skills.sh/acme/skills/pr-review",
    },
  ],
};

describe("parseSkillsFindOutput", () => {
  it("accepts a skills_find payload", () => {
    expect(parseSkillsFindOutput(payload)?.results[0]?.name).toBe("pr-review");
  });

  it("rejects malformed output", () => {
    expect(parseSkillsFindOutput({ ok: true })).toBeNull();
  });
});

describe("matchesSkillsFindOutput", () => {
  it("matches the find tool by name and payload", () => {
    expect(
      matchesSkillsFindOutput({
        output: payload,
        toolName: "skills_find",
      })
    ).toBe(true);
    expect(
      matchesSkillsFindOutput({
        output: payload,
        resolvedToolName: "skills_find",
        toolName: "engenty_tool_execute",
      })
    ).toBe(true);
    expect(
      matchesSkillsFindOutput({
        output: payload,
        toolName: "skills_install",
      })
    ).toBe(false);
  });
});
