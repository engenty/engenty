// One-time-per-tenant sync of code-provided skills (modules + builtin) into the
// read-only `managed` skills tier in file storage. Unlike the AGENTS.md/SOUL.md
// shared-workspace seed (write-when-absent, user-editable), managed skills are
// owned by code: we overwrite a managed skill only when its source content hash
// differs from the stored `engenty.installedSha`, so unchanged skills cause no
// churn / re-embed. The `custom` tier is never touched here.

import { createHash } from "node:crypto";

import { ENGENTY_COPILOT_MANAGED_SKILLS } from "@engenty/engenty-copilot/ai";

import { createDefaultModuleCapabilityLoader } from "../module-capability-loader.js";
import {
  parseSkillMarkdown,
  serializeSkillMarkdown,
} from "../skills/skill-frontmatter.js";
import type { SkillStorage } from "../skills/skill-storage.js";

export interface ManagedSkillPack {
  name: string;
  // Raw SKILL.md content (with frontmatter) as authored in code.
  skillMarkdown: string;
  // `module` | `builtin`.
  source: string;
}

export interface EnsureManagedSkillsSeedInput {
  force?: boolean;
  packs: ManagedSkillPack[];
  storage: SkillStorage;
}

export interface EnsureManagedSkillsSeedResult {
  skipped: string[];
  written: string[];
}

// Collect code-provided skills (module capability seed channel) as managed
// skill packs. Module skill markdown reaches apps/ai over the core capability
// HTTP channel; builtin copilot skills ship with the builtin package and join
// here directly (the copilot is a builtin agent, not a capability-channel module).
export async function collectManagedSkillPacks(): Promise<ManagedSkillPack[]> {
  const loader = createDefaultModuleCapabilityLoader();
  const capabilities = await loader.listModuleCapabilities();
  const packs: ManagedSkillPack[] = [];
  for (const [name, skillMarkdown] of Object.entries(
    ENGENTY_COPILOT_MANAGED_SKILLS
  )) {
    packs.push({ name, skillMarkdown, source: "builtin" });
  }
  for (const capability of capabilities) {
    for (const [name, skillMarkdown] of Object.entries(
      capability.skills ?? {}
    )) {
      // Carry the real module id as the skill source so admin grouping shows the
      // owning module (e.g. `knowledge-base`) instead of a generic `module` that
      // collapses everything into `engenty-core`.
      packs.push({ name, skillMarkdown, source: capability.moduleId });
    }
  }
  return packs;
}

function contentSha(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export async function ensureTenantManagedSkillsSeed(
  input: EnsureManagedSkillsSeedInput
): Promise<EnsureManagedSkillsSeedResult> {
  const written: string[] = [];
  const skipped: string[] = [];

  for (const pack of input.packs) {
    const sha = contentSha(pack.skillMarkdown);
    const existing = await input.storage.readManagedProvenance(pack.name);
    // Skip only when both the content and the recorded source/module id are
    // unchanged — a source change (e.g. `module` → real module id) must re-stamp.
    // When `force` is set, skip this check and always write.
    if (
      !input.force &&
      existing?.installedSha === sha &&
      existing?.source === pack.source
    ) {
      skipped.push(pack.name);
      continue;
    }

    // Re-stamp provenance (source + installedSha) onto the source frontmatter so
    // future syncs can detect changes without re-reading the code tree.
    const parsed = parseSkillMarkdown(pack.skillMarkdown);
    const skillMarkdown = serializeSkillMarkdown(
      {
        ...parsed.frontmatter,
        engenty: {
          ...parsed.frontmatter.engenty,
          installedSha: sha,
          source: pack.source,
        },
        name: pack.name,
      },
      parsed.body
    );
    await input.storage.writeManagedSkill({ name: pack.name, skillMarkdown });
    written.push(pack.name);
  }

  return { skipped, written };
}
