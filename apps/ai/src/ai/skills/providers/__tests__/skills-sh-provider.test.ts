import { describe, expect, it, vi } from "vitest";
import { createSkillsShProvider } from "../skills-sh-provider.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

describe("createSkillsShProvider", () => {
  it("searches skills.sh /api/search and maps id/name hits", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(
        "https://skills.sh/api/search?q=remotion-video-creation&limit=10"
      );
      return jsonResponse({
        count: 2,
        query: "remotion-video-creation",
        skills: [
          {
            id: "affaan-m/ecc/remotion-video-creation",
            name: "remotion-video-creation",
            skillId: "remotion-video-creation",
            source: "affaan-m/ecc",
          },
          {
            id: "remotion-dev/skills/remotion-create",
            name: "remotion-create",
            skillId: "remotion-create",
            source: "remotion-dev/skills",
          },
        ],
      });
    }) as typeof fetch;

    const provider = createSkillsShProvider({ fetchImpl });
    await expect(provider.search("remotion-video-creation")).resolves.toEqual([
      {
        name: "remotion-video-creation",
        ref: { id: "affaan-m/ecc/remotion-video-creation" },
      },
      {
        name: "remotion-create",
        ref: { id: "remotion-dev/skills/remotion-create" },
      },
    ]);
  });

  it("fetches SKILL.md and sibling files from the /r/ registry snapshot", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(
        "https://skills.sh/r/affaan-m/ecc/remotion-video-creation"
      );
      return jsonResponse({
        description: "Best practices for Remotion",
        files: [
          {
            content:
              "---\nname: remotion-video-creation\ndescription: Video.\n---\n\n# Video\n",
            path: "SKILL.md",
          },
          { content: "# 3D", path: "rules/3d.md" },
        ],
        hash: "abc123",
        name: "remotion-video-creation",
      });
    }) as typeof fetch;

    const provider = createSkillsShProvider({ fetchImpl });
    await expect(
      provider.fetchSkill({ id: "affaan-m/ecc/remotion-video-creation" })
    ).resolves.toEqual({
      files: [{ path: "rules/3d.md", text: "# 3D" }],
      name: "remotion-video-creation",
      sha: "abc123",
      skillMarkdown:
        "---\nname: remotion-video-creation\ndescription: Video.\n---\n\n# Video",
    });
  });

  it("throws when the registry responds non-OK", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: true }, 500));
    const provider = createSkillsShProvider({ fetchImpl });
    await expect(provider.search("video")).rejects.toThrow(
      "skills_sh_request_failed:500"
    );
  });
});
