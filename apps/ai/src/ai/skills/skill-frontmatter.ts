// Skill domain types + SKILL.md frontmatter parsing/serialization.
//
// A skill is a folder containing SKILL.md (+ optional references/, scripts/,
// assets/). The canonical content lives in tenant file storage; the database
// holds nothing. Provenance (where a skill came from, version) is carried in a
// nested `engenty:` frontmatter block so the rest of the frontmatter stays
// compliant with the open Agent Skills spec consumed by Mastra/agentskill.sh.

import matter from "@11ty/gray-matter";
import { z } from "zod";

// `managed` = code-provided (module/builtin), read-only in admin, synced from
// code. `custom` = uploaded or registry-installed, editable + deletable.
export type SkillTier = "managed" | "custom";

// `module` | `builtin` | `upload` | a registry provider id (e.g. "skills_sh").
export type SkillSource = string;

export interface SkillProvenance {
  category?: string;
  installedSha?: string;
  originRef?: string;
  source: SkillSource;
}

const skillProvenanceSchema = z
  .object({
    category: z.string().optional(),
    installedSha: z.string().optional(),
    originRef: z.string().optional(),
    source: z.string().min(1),
  })
  .passthrough();

// Loose frontmatter: required name/description (+ optional spec fields) plus the
// engenty provenance block; unknown keys are preserved on round-trip.
const skillFrontmatterSchema = z
  .object({
    description: z.string().optional(),
    engenty: skillProvenanceSchema.optional(),
    name: z.string().optional(),
    tags: z.array(z.string()).optional(),
    title: z.string().optional(),
    version: z.string().optional(),
  })
  .passthrough();

export type SkillFrontmatter = z.infer<typeof skillFrontmatterSchema>;

export interface SkillSummary {
  allowed_tools: string[];
  category?: string;
  description: string;
  editable: boolean;
  engenty_modules: string[];
  name: string;
  requires_sandbox: boolean;
  source: SkillSource;
  tags: string[];
  tier: SkillTier;
  title?: string;
  version?: string;
}

export interface SkillFileEntry {
  // Path relative to the skill folder, e.g. "references/style-guide.md".
  path: string;
}

export interface SkillDetail extends SkillSummary {
  body: string;
  files: SkillFileEntry[];
  frontmatter: SkillFrontmatter;
}

export interface ParsedSkillMarkdown {
  body: string;
  frontmatter: SkillFrontmatter;
}

export function parseSkillMarkdown(raw: string): ParsedSkillMarkdown {
  const parsed = matter(raw);
  const frontmatter = skillFrontmatterSchema.parse(parsed.data ?? {});
  return { body: parsed.content.trim(), frontmatter };
}

export function serializeSkillMarkdown(
  frontmatter: SkillFrontmatter,
  body: string
): string {
  // YAML serialization drops `undefined`; strip empties so the file stays clean.
  const data = Object.fromEntries(
    Object.entries(frontmatter).filter(([, value]) => value !== undefined)
  );
  return matter.stringify(`${body.trim()}\n`, data);
}

function firstNonHeadingLine(body: string): string {
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (line && !line.startsWith("#")) {
      return line.replace(/^-+\s*/, "").trim();
    }
  }
  return "";
}

function normalizeStringList(value: unknown): string[] {
  const raw =
    typeof value === "string"
      ? value.split(/[\s,]+/u)
      : Array.isArray(value)
        ? value
        : [];
  return [
    ...new Set(
      raw
        .map((entry) => String(entry).trim())
        .filter((entry) => entry.length > 0)
    ),
  ];
}

function allowedToolsFromFrontmatter(frontmatter: SkillFrontmatter): string[] {
  const record = frontmatter as Record<string, unknown>;
  return normalizeStringList(
    record["allowed-tools"] ?? record.allowed_tools ?? record.allowedTools
  );
}

const NON_MODULE_SOURCES = new Set(["builtin", "library", "module", "upload"]);

function categoryFromFrontmatter(
  frontmatter: SkillFrontmatter
): string | undefined {
  const fromProvenance = frontmatter.engenty?.category?.trim();
  if (fromProvenance) {
    return fromProvenance;
  }
  const metadata =
    "metadata" in frontmatter &&
    frontmatter.metadata &&
    typeof frontmatter.metadata === "object" &&
    !Array.isArray(frontmatter.metadata)
      ? (frontmatter.metadata as Record<string, unknown>)
      : {};
  const engentyMeta =
    metadata.engenty &&
    typeof metadata.engenty === "object" &&
    !Array.isArray(metadata.engenty)
      ? (metadata.engenty as Record<string, unknown>)
      : {};
  const fromMeta = engentyMeta.category;
  return typeof fromMeta === "string" && fromMeta.trim()
    ? fromMeta.trim()
    : undefined;
}

function moduleIdsFromFrontmatter(frontmatter: SkillFrontmatter): string[] {
  const metadata =
    "metadata" in frontmatter &&
    frontmatter.metadata &&
    typeof frontmatter.metadata === "object" &&
    !Array.isArray(frontmatter.metadata)
      ? (frontmatter.metadata as Record<string, unknown>)
      : {};
  return normalizeStringList(
    metadata.modules ??
      metadata.engenty_modules ??
      metadata.module_id ??
      metadata.moduleId
  );
}

function needsSandbox(input: { allowedTools: string[]; body: string }) {
  const normalizedTools = input.allowedTools.map((tool) => tool.toLowerCase());
  if (
    normalizedTools.some(
      (tool) =>
        tool === "mastra_workspace_execute_command" ||
        tool === "workspace_execute_command" ||
        tool === "execute_command" ||
        tool.includes("sandbox") ||
        tool.includes("shell")
    )
  ) {
    return true;
  }
  return /mastra_workspace_execute_command|\/sandbox\b|shell command|run (python|scripts?|commands?)/iu.test(
    input.body
  );
}

// Build the list-row summary from a parsed SKILL.md. `editable` is derived from
// the tier (custom only), never trusted from frontmatter.
export function buildSkillSummary(
  name: string,
  tier: SkillTier,
  parsed: ParsedSkillMarkdown
): SkillSummary {
  const { frontmatter, body } = parsed;
  const allowedTools = allowedToolsFromFrontmatter(frontmatter);
  const source =
    frontmatter.engenty?.source ?? (tier === "managed" ? "module" : "upload");
  const engentyModules = moduleIdsFromFrontmatter(frontmatter);
  const category = categoryFromFrontmatter(frontmatter);
  return {
    allowed_tools: allowedTools,
    ...(category ? { category } : {}),
    description:
      frontmatter.description?.trim() || firstNonHeadingLine(body) || "",
    editable: tier === "custom",
    engenty_modules:
      engentyModules.length > 0
        ? engentyModules
        : tier === "managed" && !NON_MODULE_SOURCES.has(source)
          ? [source]
          : [],
    name,
    requires_sandbox: needsSandbox({ allowedTools, body }),
    source,
    tags: frontmatter.tags ?? [],
    tier,
    ...(frontmatter.title?.trim() ? { title: frontmatter.title.trim() } : {}),
    ...(frontmatter.version?.trim()
      ? { version: frontmatter.version.trim() }
      : {}),
  };
}
