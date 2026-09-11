// One-time-per-tenant sync of code-provided skills (modules + builtin) into the
// read-only `managed` skills tier in file storage. Unlike the AGENTS.md/SOUL.md
// shared-workspace seed (write-when-absent, user-editable), managed skills are
// owned by code: we overwrite a managed skill only when its source content hash
// differs from the stored seed manifest (or, on first migrate, per-skill
// provenance). The `custom` tier is never touched here.
//
// Hot path after the first successful sync in a process: zero file-storage IO
// (process guard + in-memory managed summaries). Cold path with a current
// manifest: one GET of `.seed-manifest.json`, then writes only for diffs.

import { createHash } from "node:crypto";

import { listLibrarySkills } from "@engenty/ai-skills";
import { ENGENTY_COPILOT_MANAGED_SKILLS } from "@engenty/engenty-copilot/ai";

import { loadRuntimeManagedSkills } from "../../../ai/skills/index.js";
import { createDefaultModuleCapabilityLoader } from "../module-capability-loader.js";
import {
  clearManagedSkillsSynced,
  hasSyncedManagedSkills,
  markManagedSkillsSynced,
  setManagedSkillSummariesCache,
} from "../skills/managed-skills-sync-state.js";
import {
  buildSkillSummary,
  parseSkillMarkdown,
  type SkillSummary,
  serializeSkillMarkdown,
} from "../skills/skill-frontmatter.js";
import type {
  ManagedSeedManifest,
  SkillFileInput,
  SkillStorage,
} from "../skills/skill-storage.js";

export interface ManagedSkillPack {
  /** Library category folder (`software-development`, `productivity`, …). */
  category?: string;
  /** Sibling files under the skill folder (`references/`, `canvas-fonts/`, …). */
  files?: SkillFileInput[];
  name: string;
  // Raw SKILL.md content (with frontmatter) as authored in code.
  skillMarkdown: string;
  // `builtin` | `library` | `engenty-copilot` | concrete module id.
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

export interface SyncTenantManagedSkillsInput {
  force?: boolean;
  /** When omitted, packs are collected from modules + builtin. */
  packs?: ManagedSkillPack[];
  storage: SkillStorage;
  tenantId: string;
}

function packContentSha(pack: ManagedSkillPack): string {
  const hash = createHash("sha256");
  hash.update(pack.skillMarkdown, "utf8");
  const files = [...(pack.files ?? [])].toSorted((left, right) =>
    left.path.localeCompare(right.path)
  );
  for (const file of files) {
    hash.update(file.path, "utf8");
    hash.update(file.bytes);
  }
  return hash.digest("hex");
}

function packEntry(pack: ManagedSkillPack): { sha: string; source: string } {
  return { sha: packContentSha(pack), source: pack.source };
}

function buildManifest(packs: ManagedSkillPack[]): ManagedSeedManifest {
  const skills: ManagedSeedManifest["skills"] = {};
  for (const pack of packs) {
    skills[pack.name] = packEntry(pack);
  }
  return { skills, version: 1 };
}

function stampedMarkdown(pack: ManagedSkillPack, sha: string): string {
  const parsed = parseSkillMarkdown(pack.skillMarkdown);
  return serializeSkillMarkdown(
    {
      ...parsed.frontmatter,
      engenty: {
        ...parsed.frontmatter.engenty,
        installedSha: sha,
        source: pack.source,
        ...(pack.category ? { category: pack.category } : {}),
      },
      name: pack.name,
    },
    parsed.body
  );
}

/** Seed must throw when the same `name` is authored in more than one root. */
export function assertUniqueManagedSkillNames(packs: ManagedSkillPack[]): void {
  const seen = new Map<string, string>();
  for (const pack of packs) {
    const existing = seen.get(pack.name);
    if (existing) {
      throw new Error(
        `skill_name_collision:${pack.name} (${existing} vs ${pack.source})`
      );
    }
    seen.set(pack.name, pack.source);
  }
}

/** Build managed-tier list rows from code packs (no storage IO). */
export function managedSummariesFromPacks(
  packs: ManagedSkillPack[]
): SkillSummary[] {
  return packs
    .map((pack) => {
      const sha = packContentSha(pack);
      const parsed = parseSkillMarkdown(stampedMarkdown(pack, sha));
      return buildSkillSummary(pack.name, "managed", parsed);
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function rememberSyncedCatalog(tenantId: string, packs: ManagedSkillPack[]) {
  setManagedSkillSummariesCache(tenantId, managedSummariesFromPacks(packs));
  markManagedSkillsSynced(tenantId);
}

// Collect code-provided skills from three authoring roots into one flat
// managed catalog. Runtime (`builtin`) and copilot product skills ship from
// this repo; module markdown arrives over the capability HTTP channel;
// library skills live in `@engenty/ai-skills` and stay hidden until a Space
// mounts them.
export async function collectManagedSkillPacks(): Promise<ManagedSkillPack[]> {
  const loader = createDefaultModuleCapabilityLoader();
  const capabilities = await loader.listModuleCapabilities();
  const packs: ManagedSkillPack[] = [];
  for (const [name, skillMarkdown] of Object.entries(
    loadRuntimeManagedSkills()
  )) {
    packs.push({ name, skillMarkdown, source: "builtin" });
  }
  for (const [name, skillMarkdown] of Object.entries(
    ENGENTY_COPILOT_MANAGED_SKILLS
  )) {
    packs.push({ name, skillMarkdown, source: "engenty-copilot" });
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
  for (const skill of listLibrarySkills()) {
    packs.push({
      category: skill.category,
      files: skill.files,
      name: skill.name,
      skillMarkdown: skill.skillMarkdown,
      source: "library",
    });
  }
  assertUniqueManagedSkillNames(packs);
  return packs;
}

async function writePack(
  storage: SkillStorage,
  pack: ManagedSkillPack,
  sha: string
): Promise<void> {
  await storage.writeManagedSkill({
    files: pack.files,
    name: pack.name,
    skillMarkdown: stampedMarkdown(pack, sha),
  });
}

/**
 * Sync managed skills using the tenant seed manifest when present (one GET),
 * falling back to per-skill provenance only when migrating a tenant that has
 * never written a manifest. Always refreshes the in-memory managed catalog.
 */
export async function ensureTenantManagedSkillsSeed(
  input: EnsureManagedSkillsSeedInput & { tenantId?: string }
): Promise<EnsureManagedSkillsSeedResult> {
  const written: string[] = [];
  const skipped: string[] = [];
  const packs = input.packs;
  const desired = buildManifest(packs);

  const existingManifest = input.force
    ? null
    : await input.storage.readManagedSeedManifest();

  if (existingManifest?.version === 1) {
    for (const pack of packs) {
      const entry = packEntry(pack);
      const recorded = existingManifest.skills[pack.name];
      if (
        recorded &&
        recorded.sha === entry.sha &&
        recorded.source === entry.source
      ) {
        skipped.push(pack.name);
        continue;
      }
      await writePack(input.storage, pack, entry.sha);
      written.push(pack.name);
    }
  } else {
    // Migration / force: per-skill provenance (legacy) or unconditional write.
    for (const pack of packs) {
      const entry = packEntry(pack);
      if (!input.force) {
        const existing = await input.storage.readManagedProvenance(pack.name);
        if (
          existing?.installedSha === entry.sha &&
          existing?.source === entry.source
        ) {
          skipped.push(pack.name);
          continue;
        }
      }
      await writePack(input.storage, pack, entry.sha);
      written.push(pack.name);
    }
  }

  const manifestMatches =
    !!existingManifest &&
    existingManifest.version === 1 &&
    Object.keys(existingManifest.skills).length === packs.length &&
    packs.every((pack) => {
      const recorded = existingManifest.skills[pack.name];
      const entry = packEntry(pack);
      return (
        !!recorded &&
        recorded.sha === entry.sha &&
        recorded.source === entry.source
      );
    });

  if (input.force || !manifestMatches) {
    await input.storage.writeManagedSeedManifest(desired);
  }

  if (input.tenantId) {
    rememberSyncedCatalog(input.tenantId, packs);
  }

  return { skipped, written };
}

/**
 * Shared entry for workspace hook + `/ai/skills` catalog. Skips all storage IO
 * when this process already synced the tenant (unless `force`).
 */
export async function syncTenantManagedSkills(
  input: SyncTenantManagedSkillsInput
): Promise<EnsureManagedSkillsSeedResult> {
  const tenantId = input.tenantId.trim();
  const packs = input.packs ?? (await collectManagedSkillPacks());

  if (!input.force && hasSyncedManagedSkills(tenantId)) {
    rememberSyncedCatalog(tenantId, packs);
    return { skipped: packs.map((pack) => pack.name), written: [] };
  }

  try {
    return await ensureTenantManagedSkillsSeed({
      force: input.force,
      packs,
      storage: input.storage,
      tenantId,
    });
  } catch (error) {
    clearManagedSkillsSynced(tenantId);
    throw error;
  }
}
