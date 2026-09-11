import { describe, expect, it, vi } from "vitest";
import type { SkillRegistryProvider } from "../providers/types.js";
import {
  annotateRegistryHits,
  installSkillFromRegistryAndAttach,
} from "../registry-install.js";
import type { SkillStorage } from "../skill-storage.js";

const provider: SkillRegistryProvider = {
  id: "skills_sh",
  label: "skills.sh",
  fetchSkill: async (ref) => ({
    name: "pr-review",
    skillMarkdown:
      "---\nname: pr-review\ndescription: Review pull requests.\n---\n\n# PR review\n",
    sha: "abc",
    ...(ref.id.includes("files")
      ? { files: [{ path: "notes.md", text: "hi" }] }
      : {}),
  }),
  search: async () => [
    {
      name: "pr-review",
      ref: { id: "acme/skills/pr-review" },
      description: "Review pull requests.",
    },
    {
      name: "changelog",
      ref: { id: "acme/skills/changelog" },
    },
  ],
};

function fakeStorage(
  existing: string[] = []
): Pick<SkillStorage, "listSkills" | "upsertCustomSkill"> {
  const names = new Set(existing);
  return {
    listSkills: async () =>
      [...names].map((name) => ({
        allowed_tools: [],
        description: "",
        editable: true,
        engenty_modules: [],
        name,
        requires_sandbox: false,
        source: "skills_sh",
        tags: [],
        tier: "custom" as const,
      })),
    upsertCustomSkill: async (input) => {
      names.add(input.name);
      return {
        allowed_tools: [],
        body: input.body,
        description: "Review pull requests.",
        editable: true,
        engenty_modules: [],
        files: [],
        frontmatter: input.frontmatter ?? { name: input.name },
        name: input.name,
        requires_sandbox: false,
        source: "skills_sh",
        tags: [],
        tier: "custom" as const,
      };
    },
  };
}

describe("annotateRegistryHits", () => {
  it("flags installed, mounted, and preferred names", async () => {
    const results = await provider.search("review");
    expect(
      annotateRegistryHits({
        agentPreferred: new Set(["pr-review"]),
        installed: new Set(["pr-review"]),
        results,
        spaceMounted: new Set(["changelog"]),
      })
    ).toEqual([
      expect.objectContaining({
        already_in_space: false,
        already_installed: true,
        already_preferred: true,
        name: "pr-review",
        url: "https://skills.sh/acme/skills/pr-review",
      }),
      expect.objectContaining({
        already_in_space: true,
        already_installed: false,
        already_preferred: false,
        name: "changelog",
      }),
    ]);
  });
});

describe("installSkillFromRegistryAndAttach", () => {
  it("writes the custom skill and mounts it on the space", async () => {
    const putSpaceMount = vi.fn().mockResolvedValue({});
    const result = await installSkillFromRegistryAndAttach({
      core: { putSpaceMount } as never,
      provider,
      refId: "acme/skills/pr-review",
      spaceId: "space-1",
      storage: fakeStorage(),
      tenantId: "tenant-1",
    });
    expect(result.skill.name).toBe("pr-review");
    expect(result.attached.space).toEqual({ id: "space-1", ok: true });
    expect(putSpaceMount).toHaveBeenCalledWith("space-1", {
      resource_key: "pr-review",
      resource_type: "skill",
    });
  });

  it("appends the skill to a custom agent's preferred list", async () => {
    const upsertAgent = vi.fn().mockResolvedValue({});
    const result = await installSkillFromRegistryAndAttach({
      agentId: "custom.reviewer",
      provider,
      refId: "acme/skills/pr-review",
      registryStore: {
        getAgentConfig: async () => ({
          id: "custom.reviewer",
          instructions: "x",
          model: "openai/gpt-4.1",
          name: "Reviewer",
          skillIds: ["other"],
          toolIds: [],
        }),
        upsertAgent,
      },
      storage: fakeStorage(),
      tenantId: "tenant-1",
    });
    expect(result.attached.agent).toEqual({ id: "custom.reviewer", ok: true });
    expect(upsertAgent).toHaveBeenCalledWith(
      "tenant-1",
      expect.objectContaining({
        skillIds: ["other", "pr-review"],
      })
    );
  });

  it("does not fork a builtin agent into the registry", async () => {
    const upsertAgent = vi.fn();
    const result = await installSkillFromRegistryAndAttach({
      agentId: "engenty.copilot",
      provider,
      refId: "acme/skills/pr-review",
      registryStore: {
        getAgentConfig: async () => undefined,
        upsertAgent,
      },
      storage: fakeStorage(),
      tenantId: "tenant-1",
    });
    expect(result.attached.agent?.ok).toBe(false);
    expect(upsertAgent).not.toHaveBeenCalled();
  });

  it("does not claim a Space mount when permission cannot be verified", async () => {
    const result = await installSkillFromRegistryAndAttach({
      provider,
      refId: "acme/skills/pr-review",
      spaceId: "space-1",
      storage: fakeStorage(),
      tenantId: "tenant-1",
    });
    expect(result.skill.name).toBe("pr-review");
    expect(result.attached.space).toEqual({
      error:
        "Space mount was requested but no core client is available to verify permission.",
      id: "space-1",
      ok: false,
    });
  });
});
