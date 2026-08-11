import { describe, expect, it } from "vitest";
import {
  resetManagedSkillsSyncStateForTests,
  setManagedSkillSummariesCache,
} from "../managed-skills-sync-state.js";
import type { SkillSummary } from "../skill-frontmatter.js";
import {
  createSkillStorage,
  managedSeedManifestKey,
} from "../skill-storage.js";

function memoryClient(seed: Record<string, string> = {}) {
  const objects = new Map<string, Uint8Array>(
    Object.entries(seed).map(([key, value]) => [
      key,
      new TextEncoder().encode(value),
    ])
  );
  return {
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
    objects,
  };
}

describe("skill-storage managed catalog cache", () => {
  it("listSkills serves managed rows from the in-memory cache without downloads", async () => {
    resetManagedSkillsSyncStateForTests();
    const tenantId = "tenant-list-cache";
    const client = memoryClient();
    const storage = createSkillStorage({
      storage: client as never,
      tenantId,
    });

    const cached: SkillSummary[] = [
      {
        allowed_tools: [],
        description: "from cache",
        editable: false,
        engenty_modules: ["contacts"],
        name: "contacts-search",
        requires_sandbox: false,
        source: "contacts",
        tags: [],
        tier: "managed",
      },
    ];
    setManagedSkillSummariesCache(tenantId, cached);

    const downloadsBefore = client.objects.size;
    const skills = await storage.listSkills();
    expect(skills).toEqual(cached);
    expect(client.objects.size).toBe(downloadsBefore);
  });

  it("round-trips the managed seed manifest", async () => {
    resetManagedSkillsSyncStateForTests();
    const tenantId = "tenant-manifest-io";
    const client = memoryClient();
    const storage = createSkillStorage({
      storage: client as never,
      tenantId,
    });

    expect(await storage.readManagedSeedManifest()).toBeNull();
    await storage.writeManagedSeedManifest({
      version: 1,
      skills: {
        "contacts-search": { sha: "abc", source: "contacts" },
      },
    });
    expect(client.objects.has(managedSeedManifestKey(tenantId))).toBe(true);
    expect(await storage.readManagedSeedManifest()).toEqual({
      version: 1,
      skills: {
        "contacts-search": { sha: "abc", source: "contacts" },
      },
    });
  });
});
