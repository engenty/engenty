import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "@11ty/gray-matter";
import { z } from "zod";
import { normalizeAllowedToolsInput } from "../allowed-tools.js";
import type { SkillDefinition, SkillMetadataDefinition } from "../contracts.js";
import { assertValidAgentSkillName } from "../skill-name.js";

const skillFileFrontmatterSchema = z.object({
  allowed_tools: z.union([z.array(z.string()), z.string()]).optional(),
  catalog_seed_key: z.string().optional(),
  compatibility: z.string().optional(),
  description: z.string().optional(),
  license: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  name: z.string().optional(),
  title: z.string().optional(),
});

type SkillFileFrontmatter = z.infer<typeof skillFileFrontmatterSchema>;

function extractSkillDescription(body: string, fallback: string | undefined) {
  if (fallback?.trim()) {
    return fallback.trim();
  }
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    return line.replace(/^-+\s*/, "").trim();
  }
  return "";
}

function stringifyMetadataValues(
  record: Record<string, unknown> | undefined
): SkillMetadataDefinition | undefined {
  if (!record || Object.keys(record).length === 0) {
    return;
  }
  const out: SkillMetadataDefinition = {};
  for (const [key, value] of Object.entries(record)) {
    if (value === null || value === undefined) {
      continue;
    }
    out[key] = typeof value === "string" ? value : JSON.stringify(value);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function listSkillPackRoots(skillsDir: string): string[] {
  if (!existsSync(skillsDir)) {
    return [];
  }
  const roots: string[] = [];
  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const skillMd = join(skillsDir, entry.name, "SKILL.md");
    if (existsSync(skillMd)) {
      roots.push(join(skillsDir, entry.name));
    }
  }
  return roots.toSorted((left, right) =>
    basename(left).localeCompare(basename(right))
  );
}

/**
 * Resolves `ai/skills` next to a module `ai/registrar` (source or dist), mirroring
 * {@link resolveModuleActionsDir}.
 */
export function resolveModuleSkillsDir(importMetaUrl: string): string {
  const here = dirname(fileURLToPath(importMetaUrl));
  const candidates = [
    join(here, "skills"),
    join(here, "..", "..", "ai", "skills"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    `Could not find ai/skills directory relative to ${importMetaUrl}`
  );
}

export interface LoadSkillDefinitionsParams {
  /** Merged into each skill's metadata after file metadata; `module_id` always set last from {@link moduleId}. */
  defaultMetadata?: SkillMetadataDefinition;
  moduleId: string;
  skillsDir: string;
}

/**
 * Loads one skill per immediate subdirectory of `skillsDir` that contains `SKILL.md`.
 * Frontmatter `name` must match the directory name (kebab-case skill id).
 */
export function loadSkillDefinitionsFromDirectory(
  params: LoadSkillDefinitionsParams
): SkillDefinition[] {
  const roots = listSkillPackRoots(params.skillsDir);
  const definitions: SkillDefinition[] = [];

  for (const root of roots) {
    const folderName = basename(root);
    const filePath = join(root, "SKILL.md");
    const parsed = matter(readFileSync(filePath, "utf8"));
    const raw = { ...(parsed.data as Record<string, unknown>) };
    const toolsMerged =
      raw["allowed-tools"] ?? raw.allowed_tools ?? raw.allowedTools;
    raw["allowed-tools"] = undefined;
    raw.allowedTools = undefined;
    if (toolsMerged !== undefined) {
      raw.allowed_tools = toolsMerged;
    }
    const frontmatter = skillFileFrontmatterSchema.parse(raw);
    const declaredName = frontmatter.name?.trim() || folderName;
    if (declaredName !== folderName) {
      throw new Error(
        `Skill pack folder "${folderName}" must match frontmatter name "${declaredName}" in ${filePath}`
      );
    }
    assertValidAgentSkillName(declaredName);

    const description = (
      frontmatter.description?.trim() ||
      extractSkillDescription(parsed.content, frontmatter.description)
    ).trim();
    if (!description) {
      throw new Error(
        `Skill "${declaredName}" must set description in frontmatter or body (${filePath})`
      );
    }

    const fileMetadata = stringifyMetadataValues(frontmatter.metadata);
    const metadata: SkillMetadataDefinition = {
      ...(params.defaultMetadata ?? {}),
      ...(fileMetadata ?? {}),
      module_id: params.moduleId,
    };

    const allowedTools = normalizeAllowedToolsInput(frontmatter.allowed_tools);

    const def: SkillDefinition = {
      description,
      metadata,
      name: declaredName,
      ...(frontmatter.title?.trim() ? { title: frontmatter.title.trim() } : {}),
      ...(frontmatter.license?.trim()
        ? { license: frontmatter.license.trim() }
        : {}),
      ...(frontmatter.compatibility?.trim()
        ? { compatibility: frontmatter.compatibility.trim() }
        : {}),
      ...(frontmatter.catalog_seed_key?.trim()
        ? { catalog_seed_key: frontmatter.catalog_seed_key.trim() }
        : {}),
      ...(allowedTools ? { allowed_tools: allowedTools } : {}),
    };
    definitions.push(def);
  }

  return definitions;
}
