import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { resetManagedSkillsSyncStateForTests } from "../../skills/managed-skills-sync-state.js";
import type {
  ManagedSeedManifest,
  SkillStorage,
} from "../../skills/skill-storage.js";
import {
  assertUniqueManagedSkillNames,
  ensureTenantManagedSkillsSeed,
  type ManagedSkillPack,
  syncTenantManagedSkills,
} from "../tenant-skills-seed.js";

function sha(content: string) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function packMarkdown(name: string, source: string, body = "Body.") {
  return [
    "---",
    `name: ${name}`,
    "description: Search KB content.",
    "engenty:",
    `  source: ${source}`,
    "---",
    "",
    `# ${name}`,
    "",
    body,
  ].join("\n");
}

describe("tenant managed skills seed", () => {
  beforeEach(() => {
    resetManagedSkillsSyncStateForTests();
  });

  it("rewrites unchanged managed skills when provenance source changes", async () => {
    const skillMarkdown = packMarkdown("kb-search-and-retrieve", "module");
    const pack: ManagedSkillPack = {
      name: "kb-search-and-retrieve",
      skillMarkdown,
      source: "knowledge-base",
    };
    const writes: { name: string; skillMarkdown: string }[] = [];
    const manifests: ManagedSeedManifest[] = [];
    const storage = {
      readManagedSeedManifest: async () => null,
      readManagedProvenance: async () => ({
        installedSha: sha(skillMarkdown),
        source: "module",
      }),
      writeManagedSeedManifest: async (manifest: ManagedSeedManifest) => {
        manifests.push(manifest);
      },
      writeManagedSkill: async (input: {
        name: string;
        skillMarkdown: string;
      }) => {
        writes.push(input);
      },
    } as unknown as SkillStorage;

    const result = await ensureTenantManagedSkillsSeed({
      packs: [pack],
      storage,
    });

    expect(result).toEqual({
      skipped: [],
      written: ["kb-search-and-retrieve"],
    });
    expect(writes).toHaveLength(1);
    expect(writes[0]?.skillMarkdown).toContain("source: knowledge-base");
    expect(manifests).toHaveLength(1);
    expect(manifests[0]?.skills["kb-search-and-retrieve"]?.source).toBe(
      "knowledge-base"
    );
  });

  it("skips all per-skill IO when the seed manifest already matches", async () => {
    const skillMarkdown = packMarkdown("contacts-search", "contacts");
    const pack: ManagedSkillPack = {
      name: "contacts-search",
      skillMarkdown,
      source: "contacts",
    };
    let provenanceReads = 0;
    let skillWrites = 0;
    let manifestWrites = 0;
    const storage = {
      readManagedSeedManifest: async (): Promise<ManagedSeedManifest> => ({
        version: 1,
        skills: {
          "contacts-search": {
            sha: sha(skillMarkdown),
            source: "contacts",
          },
        },
      }),
      readManagedProvenance: async () => {
        provenanceReads += 1;
        return;
      },
      writeManagedSeedManifest: async () => {
        manifestWrites += 1;
      },
      writeManagedSkill: async () => {
        skillWrites += 1;
      },
    } as unknown as SkillStorage;

    const result = await ensureTenantManagedSkillsSeed({
      packs: [pack],
      storage,
      tenantId: "tenant-manifest-hit",
    });

    expect(result).toEqual({
      skipped: ["contacts-search"],
      written: [],
    });
    expect(provenanceReads).toBe(0);
    expect(skillWrites).toBe(0);
    expect(manifestWrites).toBe(0);
  });

  it("syncTenantManagedSkills skips storage after the first success in-process", async () => {
    const skillMarkdown = packMarkdown("inbox-triage", "inbox");
    const pack: ManagedSkillPack = {
      name: "inbox-triage",
      skillMarkdown,
      source: "inbox",
    };
    let manifestReads = 0;
    const storage = {
      readManagedSeedManifest: async (): Promise<ManagedSeedManifest> => {
        manifestReads += 1;
        return {
          version: 1,
          skills: {
            "inbox-triage": { sha: sha(skillMarkdown), source: "inbox" },
          },
        };
      },
      readManagedProvenance: async () => {
        throw new Error("should not read provenance");
      },
      writeManagedSeedManifest: async () => {
        throw new Error("should not write manifest");
      },
      writeManagedSkill: async () => {
        throw new Error("should not write skill");
      },
    } as unknown as SkillStorage;

    const first = await syncTenantManagedSkills({
      packs: [pack],
      storage,
      tenantId: "tenant-process-hit",
    });
    const second = await syncTenantManagedSkills({
      packs: [pack],
      storage,
      tenantId: "tenant-process-hit",
    });

    expect(first.skipped).toEqual(["inbox-triage"]);
    expect(second.skipped).toEqual(["inbox-triage"]);
    expect(manifestReads).toBe(1);
  });

  it("throws when two packs share a skill name", () => {
    expect(() =>
      assertUniqueManagedSkillNames([
        { name: "plan", skillMarkdown: "# a", source: "builtin" },
        { name: "plan", skillMarkdown: "# b", source: "library" },
      ])
    ).toThrow("skill_name_collision:plan (builtin vs library)");
  });

  it("rewrites a managed skill when sibling files change", async () => {
    const skillMarkdown = packMarkdown("canvas-design", "library");
    const pack: ManagedSkillPack = {
      files: [
        {
          bytes: new TextEncoder().encode("font-v2"),
          path: "canvas-fonts/Lora-Regular.ttf",
        },
      ],
      name: "canvas-design",
      skillMarkdown,
      source: "library",
    };
    const writes: { files?: { path: string }[]; name: string }[] = [];
    const storage = {
      readManagedSeedManifest: async () => ({
        skills: {
          "canvas-design": {
            sha: sha(skillMarkdown),
            source: "library",
          },
        },
        version: 1 as const,
      }),
      readManagedProvenance: async () => null,
      writeManagedSeedManifest: async () => undefined,
      writeManagedSkill: async (input: {
        files?: { path: string }[];
        name: string;
      }) => {
        writes.push(input);
      },
    } as unknown as SkillStorage;

    const result = await ensureTenantManagedSkillsSeed({
      packs: [pack],
      storage,
    });

    expect(result.written).toEqual(["canvas-design"]);
    expect(writes[0]?.files?.map((file) => file.path)).toEqual([
      "canvas-fonts/Lora-Regular.ttf",
    ]);
  });
});
