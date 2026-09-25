import { describe, expect, it, vi } from "vitest";
import { engentyToolsRunAls } from "../../ai/tools/engenty-tools/lib/run-context.js";
import type { SpaceGateSurface } from "../../ai/tools/engenty-tools/lib/space-gate.js";
import { createSkillsFindTools } from "../../ai/tools/skills-find-tool.js";
import { SkillRegistryProviderRegistry } from "../ai/skills/providers/registry.js";
import type { SkillRegistryProvider } from "../ai/skills/providers/types.js";
import type { SkillStorage } from "../ai/skills/skill-storage.js";
import { testToolContext } from "./helpers/tool-context.js";

const SPACE_ID = "019fe8ec-0000-0000-0000-0000000000ab";

const marketing: SpaceGateSurface = {
  allConnectorPrefixes: new Set(),
  connectorPrefixes: new Set(),
  moduleIds: new Set(["projects"]),
  readOnlyModuleIds: new Set(),
  spaceId: SPACE_ID,
};

const provider: SkillRegistryProvider = {
  id: "skills_sh",
  label: "skills.sh",
  fetchSkill: async () => ({
    name: "pr-review",
    skillMarkdown:
      "---\nname: pr-review\ndescription: Review pull requests.\n---\n\n# PR review\n",
    sha: "abc",
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

function providerRegistry() {
  const registry = new SkillRegistryProviderRegistry();
  registry.register(provider);
  return registry;
}

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
    upsertCustomSkill: async (input) => ({
      allowed_tools: [],
      body: "body",
      description: "Review pull requests.",
      editable: true,
      engenty_modules: [],
      files: [],
      frontmatter: { name: input.name },
      name: input.name,
      requires_sandbox: false,
      source: "skills_sh",
      tags: [],
      tier: "custom" as const,
    }),
  };
}

const scoped = {
  accessToken: "token",
  coreBaseUrl: "http://core.local",
  storage: fakeStorage(["pr-review"]),
  tenantId: "tenant-1",
};

describe("createSkillsFindTools", () => {
  it("fails closed when the Space is unresolved instead of presenting tenant-wide choices", async () => {
    const getSpaceSurface = vi.fn();
    const tools = createSkillsFindTools({
      coreClientFor: () => ({ getSpaceSurface }) as never,
      providerRegistry: providerRegistry(),
      scopedStorageFor: () => scoped,
    });

    const result = await engentyToolsRunAls.run(
      {
        tenantId: "tenant-1",
        space: {
          claimed_space_id: SPACE_ID,
          kind: "unresolved",
          reason: "not_found",
        },
      },
      () => tools.skills_find.execute!({ query: "review" }, testToolContext())
    );

    expect(result).toMatchObject({
      ok: false,
      code: "space_context_unresolved",
    });
    expect(getSpaceSurface).not.toHaveBeenCalled();
  });

  it("fails closed when a Space surface cannot be loaded", async () => {
    const tools = createSkillsFindTools({
      coreClientFor: () =>
        ({
          getSpaceSurface: vi.fn().mockRejectedValue(new Error("unavailable")),
        }) as never,
      providerRegistry: providerRegistry(),
      scopedStorageFor: () => scoped,
    });

    const result = await engentyToolsRunAls.run(
      { tenantId: "tenant-1", space: marketing },
      () => tools.skills_find.execute!({ query: "review" }, testToolContext())
    );

    expect(result).toMatchObject({
      ok: false,
      code: "space_context_unresolved",
    });
  });

  it("does not claim install success when the Space mount is refused", async () => {
    const putSpaceMount = vi.fn().mockRejectedValue(new Error("forbidden"));
    const tools = createSkillsFindTools({
      coreClientFor: () => ({ putSpaceMount }) as never,
      providerRegistry: providerRegistry(),
      scopedStorageFor: () => ({
        ...scoped,
        storage: fakeStorage(),
      }),
    });

    const result = await engentyToolsRunAls.run(
      { tenantId: "tenant-1", space: marketing },
      () =>
        tools.skills_install.execute!(
          { ref_id: "acme/skills/pr-review" },
          testToolContext()
        )
    );

    expect(result).toMatchObject({
      ok: false,
      code: "space_mount_failed",
    });
    expect(putSpaceMount).toHaveBeenCalledWith(SPACE_ID, {
      resource_key: "pr-review",
      resource_type: "skill",
    });
  });
});
