// File-storage-backed skill catalog. The tenant's skills live under
//   tenants/<tid>/ai/skills/<tier>/<name>/SKILL.md (+ sibling files)
// across two tiers: `managed` (code-provided, read-only) and `custom`
// (uploaded / registry-installed, editable). This service is the only writer of
// `custom/` via the admin API; the seed (tenant-skills-seed) is the only writer
// of `managed/`. Mutations here are guarded to the custom tier so the read-only
// invariant holds at the service layer, not just in the UI.

import { fileStorageTenantObjectKey } from "@engenty/file-storage";

import type { EngentyCoreFileStorageClient } from "../workspace/core-file-storage-client.js";
import {
  clearManagedSkillSummariesCache,
  getManagedSkillSummariesCache,
  setManagedSkillSummariesCache,
} from "./managed-skills-sync-state.js";
import { invalidateModuleSkillHintTenant } from "./module-skill-hint-cache.js";
import {
  buildSkillSummary,
  parseSkillMarkdown,
  type SkillDetail,
  type SkillFrontmatter,
  type SkillSummary,
  type SkillTier,
  serializeSkillMarkdown,
} from "./skill-frontmatter.js";

const SKILL_MD = "SKILL.md";
/** Tenant-scoped sync ledger for code-owned managed skills (one GET to skip N). */
const MANAGED_SEED_MANIFEST = ".seed-manifest.json";

export interface ManagedSeedManifest {
  skills: Record<string, { sha: string; source: string }>;
  version: 1;
}

export class SkillReadOnlyError extends Error {
  constructor(name: string) {
    super(`skill_read_only:${name}`);
    this.name = "SkillReadOnlyError";
  }
}

export interface SkillFileInput {
  bytes: Uint8Array;
  contentType?: string;
  // Path relative to the skill folder, e.g. "references/x.md".
  path: string;
}

export interface UpsertCustomSkillInput {
  body: string;
  files?: SkillFileInput[];
  frontmatter?: Partial<SkillFrontmatter>;
  name: string;
}

export interface WriteManagedSkillInput {
  files?: SkillFileInput[];
  // Full SKILL.md content (with frontmatter) as authored in code.
  name: string;
  skillMarkdown: string;
}

type SkillStorageClient = Pick<
  EngentyCoreFileStorageClient,
  "delete" | "download" | "exists" | "list" | "upload"
>;

export interface CreateSkillStorageOptions {
  storage: SkillStorageClient;
  tenantId: string;
}

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export function skillTierPrefix(tenantId: string, tier: SkillTier): string {
  return `${fileStorageTenantObjectKey(tenantId, "ai", "skills", tier)}/`;
}

export function normalizeSkillRelativePath(relativePath: string): string {
  return relativePath
    .split("/")
    .filter((segment) => segment.length > 0 && segment !== ".")
    .join("/");
}

export function skillObjectKey(
  tenantId: string,
  tier: SkillTier,
  name: string,
  relativePath: string
): string {
  const segments = normalizeSkillRelativePath(relativePath).split("/");
  if (segments.includes("..")) {
    throw new Error("skill_path_invalid");
  }
  return fileStorageTenantObjectKey(
    tenantId,
    "ai",
    "skills",
    tier,
    name,
    ...segments.filter(Boolean)
  );
}

export function managedSeedManifestKey(tenantId: string): string {
  return fileStorageTenantObjectKey(
    tenantId,
    "ai",
    "skills",
    "managed",
    MANAGED_SEED_MANIFEST
  );
}

export function createSkillStorage(options: CreateSkillStorageOptions) {
  const { storage, tenantId } = options;

  async function readMarkdown(
    tier: SkillTier,
    name: string
  ): Promise<string | null> {
    const bytes = await storage.download(
      skillObjectKey(tenantId, tier, name, SKILL_MD)
    );
    return bytes ? decoder.decode(bytes) : null;
  }

  // Folder names directly under a tier prefix that contain a SKILL.md.
  async function listSkillNames(tier: SkillTier): Promise<string[]> {
    const prefix = skillTierPrefix(tenantId, tier);
    const files = await storage.list(prefix, { recursive: true });
    const names = new Set<string>();
    for (const file of files) {
      if (!file.key.startsWith(prefix)) {
        continue;
      }
      const rest = file.key.slice(prefix.length);
      const [folder, ...tail] = rest.split("/");
      if (folder && tail.length === 1 && tail[0] === SKILL_MD) {
        names.add(folder);
      }
    }
    return [...names].sort();
  }

  async function summarize(
    tier: SkillTier,
    name: string
  ): Promise<SkillSummary | null> {
    const raw = await readMarkdown(tier, name);
    if (raw === null) {
      return null;
    }
    return buildSkillSummary(name, tier, parseSkillMarkdown(raw));
  }

  async function listSkillFiles(tier: SkillTier, name: string) {
    const folderPrefix = skillObjectKey(tenantId, tier, name, "");
    const files = await storage.list(folderPrefix, { recursive: true });
    const paths = files
      .map((file) => {
        const rest = file.key.startsWith(folderPrefix)
          ? file.key.slice(folderPrefix.length)
          : file.key;
        return normalizeSkillRelativePath(rest);
      })
      .filter((path) => path.length > 0 && !path.split("/").includes(".."));
    if (!paths.includes(SKILL_MD) && (await readMarkdown(tier, name))) {
      paths.push(SKILL_MD);
    }
    return [...new Set(paths)]
      .toSorted((left, right) => {
        if (left === SKILL_MD) {
          return -1;
        }
        if (right === SKILL_MD) {
          return 1;
        }
        return left.localeCompare(right);
      })
      .map((path) => ({ path }));
  }

  async function detail(
    tier: SkillTier,
    name: string
  ): Promise<SkillDetail | null> {
    const raw = await readMarkdown(tier, name);
    if (raw === null) {
      return null;
    }
    const parsed = parseSkillMarkdown(raw);
    const summary = buildSkillSummary(name, tier, parsed);
    const files = await listSkillFiles(tier, name);
    return {
      ...summary,
      body: parsed.body,
      files,
      frontmatter: parsed.frontmatter,
    };
  }

  async function listTierSummaries(tier: SkillTier): Promise<SkillSummary[]> {
    const names = await listSkillNames(tier);
    const rows = await Promise.all(
      names.map(async (name) => summarize(tier, name))
    );
    return rows.filter((row): row is SkillSummary => row !== null);
  }

  return {
    async readManagedSeedManifest(): Promise<ManagedSeedManifest | null> {
      const bytes = await storage.download(managedSeedManifestKey(tenantId));
      if (!bytes) {
        return null;
      }
      try {
        const parsed = JSON.parse(decoder.decode(bytes)) as ManagedSeedManifest;
        if (
          parsed?.version !== 1 ||
          !parsed.skills ||
          typeof parsed.skills !== "object"
        ) {
          return null;
        }
        return parsed;
      } catch {
        return null;
      }
    },

    async writeManagedSeedManifest(
      manifest: ManagedSeedManifest
    ): Promise<void> {
      await storage.upload(
        managedSeedManifestKey(tenantId),
        encoder.encode(`${JSON.stringify(manifest, null, 2)}\n`),
        {
          contentType: "application/json; charset=utf-8",
          module: "ai",
          upsert: true,
        }
      );
    },

    async listSkills(): Promise<SkillSummary[]> {
      // Managed tier: prefer the post-seed in-memory catalog (built from code
      // packs) so listing does not re-GET every SKILL.md. Custom still loads
      // from storage, in parallel.
      let managed = getManagedSkillSummariesCache(tenantId);
      if (!managed) {
        managed = await listTierSummaries("managed");
        if (managed.length > 0) {
          setManagedSkillSummariesCache(tenantId, managed);
        }
      }
      const custom = await listTierSummaries("custom");
      return [...managed, ...custom];
    },

    // Resolve a skill by name, custom tier first (a custom fork shadows the
    // managed copy of the same name).
    async getSkill(name: string): Promise<SkillDetail | undefined> {
      for (const tier of ["custom", "managed"] as SkillTier[]) {
        const found = await detail(tier, name);
        if (found) {
          return found;
        }
      }
      return;
    },

    async readSkillFile(
      name: string,
      relativePath: string
    ): Promise<Uint8Array | null> {
      for (const tier of ["custom", "managed"] as SkillTier[]) {
        const key = skillObjectKey(tenantId, tier, name, relativePath);
        if (await storage.exists(key)) {
          return storage.download(key);
        }
      }
      return null;
    },

    async writeCustomSkillFile(input: {
      bytes: Uint8Array;
      contentType?: string;
      name: string;
      path: string;
    }): Promise<void> {
      const name = input.name.trim();
      const relativePath = normalizeSkillRelativePath(input.path);
      if (!relativePath || relativePath === SKILL_MD) {
        throw new Error("skill_path_invalid");
      }
      const customKey = skillObjectKey(tenantId, "custom", name, SKILL_MD);
      if (!(await storage.exists(customKey))) {
        if (await this.managedSkillExists(name)) {
          throw new SkillReadOnlyError(name);
        }
        throw new Error(`skill_not_found:${name}`);
      }
      await storage.upload(
        skillObjectKey(tenantId, "custom", name, relativePath),
        input.bytes,
        {
          contentType: input.contentType ?? "application/octet-stream",
          module: "ai",
          upsert: true,
        }
      );
      invalidateModuleSkillHintTenant(tenantId);
    },

    async managedSkillExists(name: string): Promise<boolean> {
      return storage.exists(
        skillObjectKey(tenantId, "managed", name, SKILL_MD)
      );
    },

    async upsertCustomSkill(
      input: UpsertCustomSkillInput
    ): Promise<SkillDetail> {
      const name = input.name.trim();
      const frontmatter: SkillFrontmatter = {
        ...input.frontmatter,
        engenty: {
          source: input.frontmatter?.engenty?.source ?? "upload",
          ...input.frontmatter?.engenty,
        },
        name,
      };
      const markdown = serializeSkillMarkdown(frontmatter, input.body);
      await storage.upload(
        skillObjectKey(tenantId, "custom", name, SKILL_MD),
        encoder.encode(markdown),
        {
          contentType: "text/markdown; charset=utf-8",
          module: "ai",
          upsert: true,
        }
      );
      for (const file of input.files ?? []) {
        await storage.upload(
          skillObjectKey(tenantId, "custom", name, file.path),
          file.bytes,
          {
            contentType: file.contentType ?? "application/octet-stream",
            module: "ai",
            upsert: true,
          }
        );
      }
      const saved = await detail("custom", name);
      if (!saved) {
        throw new Error(`skill_upsert_failed:${name}`);
      }
      // C6: custom writes change the tenant catalog — drop the cached hints.
      invalidateModuleSkillHintTenant(tenantId);
      return saved;
    },

    async deleteCustomSkill(name: string): Promise<boolean> {
      const folderPrefix = skillObjectKey(tenantId, "custom", name, "");
      const files = await storage.list(folderPrefix, { recursive: true });
      if (files.length === 0) {
        // Guard against deleting a managed skill via the custom-only path.
        if (await this.managedSkillExists(name)) {
          throw new SkillReadOnlyError(name);
        }
        return false;
      }
      for (const file of files) {
        await storage.delete(file.key);
      }
      invalidateModuleSkillHintTenant(tenantId);
      return true;
    },

    // Managed-tier writer used only by the code-skill seed.
    async writeManagedSkill(input: WriteManagedSkillInput): Promise<void> {
      await storage.upload(
        skillObjectKey(tenantId, "managed", input.name, SKILL_MD),
        encoder.encode(input.skillMarkdown),
        {
          contentType: "text/markdown; charset=utf-8",
          module: "ai",
          upsert: true,
        }
      );
      for (const file of input.files ?? []) {
        await storage.upload(
          skillObjectKey(tenantId, "managed", input.name, file.path),
          file.bytes,
          {
            contentType: file.contentType ?? "application/octet-stream",
            module: "ai",
            upsert: true,
          }
        );
      }
      // Catalog row may change; drop caches so the next list rebuilds.
      clearManagedSkillSummariesCache(tenantId);
      invalidateModuleSkillHintTenant(tenantId);
    },

    // Stored provenance for a managed skill, used by the seed to detect both
    // content changes (installedSha) and source/module-id changes.
    async readManagedProvenance(
      name: string
    ): Promise<{ installedSha?: string; source?: string } | undefined> {
      const raw = await readMarkdown("managed", name);
      if (raw === null) {
        return;
      }
      const engenty = parseSkillMarkdown(raw).frontmatter.engenty;
      return {
        installedSha: engenty?.installedSha,
        source: engenty?.source,
      };
    },
  };
}

export type SkillStorage = ReturnType<typeof createSkillStorage>;
