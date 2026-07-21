// Skill proposals live OUTSIDE the discovered tiers: put() writes under
// ai/skills/proposed/, list/get parse it back, remove() clears the folder.
// Discovery exclusion is positional (DEFAULT_SKILL_DISCOVERY_PATHS only walks
// /skills/managed and /skills/custom) — assert the key prefix here.

import { describe, expect, it } from "vitest";
import { DEFAULT_SKILL_DISCOVERY_PATHS } from "../../workspace/workspace-presets.js";
import {
  createSkillProposalStore,
  skillProposalKey,
} from "../skill-proposals.js";

function createFakeStorage() {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    client: {
      async delete(key: string) {
        files.delete(key);
      },
      async download(key: string) {
        return files.get(key) ?? null;
      },
      async list(prefix: string) {
        return [...files.keys()]
          .filter((key) => key.startsWith(prefix))
          .map((key) => ({ key }));
      },
      async upload(key: string, bytes: Uint8Array) {
        files.set(key, bytes);
      },
    },
  };
}

describe("skill proposals", () => {
  it("stores proposals under the proposed/ area, outside discovery paths", () => {
    const key = skillProposalKey("tenant-1", "invoice-dunning");
    expect(key).toContain("/ai/skills/proposed/invoice-dunning/SKILL.md");
    expect(DEFAULT_SKILL_DISCOVERY_PATHS).toEqual([
      "/skills/managed",
      "/skills/custom",
    ]);
    for (const path of DEFAULT_SKILL_DISCOVERY_PATHS) {
      expect(path.includes("proposed")).toBe(false);
    }
  });

  it("round-trips put → list → get with provenance", async () => {
    const fake = createFakeStorage();
    const store = createSkillProposalStore({
      storage: fake.client,
      tenantId: "tenant-1",
    });
    await store.put({
      body: "## When to use\nWhen dunning invoices.\n\n## Steps\n1. …",
      description: "Use when chasing overdue invoices",
      name: "invoice-dunning",
      proposedBy: "invoices.manager",
    });
    const listed = await store.list();
    expect(listed).toEqual([
      {
        description: "Use when chasing overdue invoices",
        name: "invoice-dunning",
        proposed_by: "invoices.manager",
      },
    ]);
    const detail = await store.get("invoice-dunning");
    expect(detail?.body).toContain("When dunning invoices");
    expect(detail?.frontmatter.engenty?.source).toBe("agent-proposal");
    expect(detail?.frontmatter.engenty?.originRef).toBe("invoices.manager");
  });

  it("remove clears every file of the proposal", async () => {
    const fake = createFakeStorage();
    const store = createSkillProposalStore({
      storage: fake.client,
      tenantId: "tenant-1",
    });
    await store.put({
      body: "body long enough to be a skill draft",
      description: "desc that is long enough",
      name: "some-skill",
      proposedBy: null,
    });
    expect(fake.files.size).toBe(1);
    await store.remove("some-skill");
    expect(fake.files.size).toBe(0);
    expect(await store.get("some-skill")).toBeNull();
  });
});
