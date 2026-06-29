import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { SkillStorage } from "../../skills/skill-storage.js";
import {
  ensureTenantManagedSkillsSeed,
  type ManagedSkillPack,
} from "../tenant-skills-seed.js";

function sha(content: string) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

describe("tenant managed skills seed", () => {
  it("rewrites unchanged managed skills when provenance source changes", async () => {
    const skillMarkdown = [
      "---",
      "name: kb-search-and-retrieve",
      "description: Search KB content.",
      "engenty:",
      "  source: module",
      "---",
      "",
      "# KB Search",
      "",
      "Search knowledge base content.",
    ].join("\n");
    const pack: ManagedSkillPack = {
      name: "kb-search-and-retrieve",
      skillMarkdown,
      source: "knowledge-base",
    };
    const writes: { name: string; skillMarkdown: string }[] = [];
    const storage = {
      readManagedProvenance: async () => ({
        installedSha: sha(skillMarkdown),
        source: "module",
      }),
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
  });
});
