import { describe, expect, it } from "vitest";
import { resolveModuleSkillCatalogHint } from "../module-skill-hint.js";
import { invalidateModuleSkillHintTenant } from "../module-skill-hint-cache.js";
import type { SkillSummary, SkillTier } from "../skill-frontmatter.js";
import { createSkillStorage, type SkillStorage } from "../skill-storage.js";

function summary(
  name: string,
  modules: string[],
  tier: SkillTier = "managed",
  description = `${name} description`
): SkillSummary {
  return {
    allowed_tools: [],
    description,
    editable: tier === "custom",
    engenty_modules: modules,
    name,
    requires_sandbox: false,
    source: tier === "managed" ? "module" : "upload",
    tags: [],
    tier,
  };
}

function fakeStorage(skills: SkillSummary[]): SkillStorage {
  return {
    listSkills: async () => skills,
  } as unknown as SkillStorage;
}

let tenantSeq = 0;
function freshTenant(): string {
  tenantSeq += 1;
  return `tenant-${tenantSeq}`;
}

// Each test uses a fresh tenant id, so no shared-cache bleed between tests.
describe("resolveModuleSkillCatalogHint", () => {
  it("renders only skills tagged for the module", async () => {
    const hint = await resolveModuleSkillCatalogHint({
      moduleId: "contacts",
      skillStorage: fakeStorage([
        summary("contacts-search", ["contacts"]),
        summary("kb-retrieve", ["knowledge-base"]),
      ]),
      tenantId: freshTenant(),
    });
    expect(hint).toContain("## Skills for the current module (contacts)");
    expect(hint).toContain("- contacts-search — contacts-search description");
    expect(hint).not.toContain("kb-retrieve");
    expect(hint).toContain(
      "Load one with the skill tool before doing module work; skill_search covers everything else."
    );
  });

  it("returns null without module context or tagged skills", async () => {
    const storage = fakeStorage([summary("other", ["leads"])]);
    expect(
      await resolveModuleSkillCatalogHint({
        moduleId: null,
        skillStorage: storage,
        tenantId: freshTenant(),
      })
    ).toBeNull();
    expect(
      await resolveModuleSkillCatalogHint({
        moduleId: "contacts",
        skillStorage: storage,
        tenantId: freshTenant(),
      })
    ).toBeNull();
  });

  it("lets a custom skill shadow the managed skill of the same name", async () => {
    const hint = await resolveModuleSkillCatalogHint({
      moduleId: "contacts",
      skillStorage: fakeStorage([
        summary("contacts-search", ["contacts"], "managed", "managed copy"),
        summary("contacts-search", ["contacts"], "custom", "custom fork"),
      ]),
      tenantId: freshTenant(),
    });
    expect(hint).toContain("custom fork");
    expect(hint).not.toContain("managed copy");
    expect(hint?.match(/contacts-search/g)).toHaveLength(1);
  });

  it("caps the list at 10 and appends the overflow line", async () => {
    const skills = Array.from({ length: 13 }, (_, i) =>
      summary(`skill-${String(i).padStart(2, "0")}`, ["contacts"])
    );
    const hint = await resolveModuleSkillCatalogHint({
      moduleId: "contacts",
      skillStorage: fakeStorage(skills),
      tenantId: freshTenant(),
    });
    expect(hint?.match(/^- skill-/gm)).toHaveLength(10);
    expect(hint).toContain("…and 3 more — use skill_search");
  });

  it("truncates further under the hard char cap, never the format", async () => {
    const skills = Array.from({ length: 10 }, (_, i) =>
      summary(`skill-${i}`, ["contacts"], "managed", "x".repeat(400))
    );
    const hint = await resolveModuleSkillCatalogHint({
      moduleId: "contacts",
      skillStorage: fakeStorage(skills),
      tenantId: freshTenant(),
    });
    expect(hint?.length).toBeLessThanOrEqual(1500);
    expect(hint).toContain("## Skills for the current module (contacts)");
    expect(hint).toMatch(/…and \d+ more — use skill_search/);
    expect(hint).toContain("Load one with the skill tool");
  });

  it("caches per (tenant, module) and refreshes after invalidation", async () => {
    const tenantId = freshTenant();
    const first = await resolveModuleSkillCatalogHint({
      moduleId: "contacts",
      skillStorage: fakeStorage([summary("contacts-a", ["contacts"])]),
      tenantId,
    });
    expect(first).toContain("contacts-a");

    // Changed underlying catalog, but cache still serves the old block.
    const changed = fakeStorage([summary("contacts-b", ["contacts"])]);
    expect(
      await resolveModuleSkillCatalogHint({
        moduleId: "contacts",
        skillStorage: changed,
        tenantId,
      })
    ).toBe(first);

    invalidateModuleSkillHintTenant(tenantId);
    const refreshed = await resolveModuleSkillCatalogHint({
      moduleId: "contacts",
      skillStorage: changed,
      tenantId,
    });
    expect(refreshed).toContain("contacts-b");
    expect(refreshed).not.toContain("contacts-a");
  });

  it("invalidates the cache on custom skill writes through skill-storage", async () => {
    const tenantId = freshTenant();
    // Minimal in-memory file-storage client backing a real SkillStorage.
    const objects = new Map<string, Uint8Array>();
    const memoryClient = {
      delete: async (key: string) => {
        objects.delete(key);
      },
      download: async (key: string) => objects.get(key) ?? null,
      exists: async (key: string) => objects.has(key),
      list: async (prefix: string) =>
        [...objects.keys()]
          .filter((key) => key.startsWith(prefix))
          .map((key) => ({ key })),
      upload: async (key: string, bytes: Uint8Array) => {
        objects.set(key, bytes);
      },
    };
    const storage = createSkillStorage({
      storage: memoryClient as never,
      tenantId,
    });

    // Empty catalog cached as null.
    expect(
      await resolveModuleSkillCatalogHint({
        moduleId: "contacts",
        skillStorage: storage,
        tenantId,
      })
    ).toBeNull();

    await storage.upsertCustomSkill({
      body: "# contacts-notes\n\nWrite notes.",
      frontmatter: {
        description: "Write contact notes.",
        metadata: { modules: ["contacts"] },
      } as never,
      name: "contacts-notes",
    });

    // The upsert invalidated the tenant — the hint reflects the new skill.
    const hint = await resolveModuleSkillCatalogHint({
      moduleId: "contacts",
      skillStorage: storage,
      tenantId,
    });
    expect(hint).toContain("contacts-notes — Write contact notes.");

    await storage.deleteCustomSkill("contacts-notes");
    expect(
      await resolveModuleSkillCatalogHint({
        moduleId: "contacts",
        skillStorage: storage,
        tenantId,
      })
    ).toBeNull();
  });
});
