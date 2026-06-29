import { parse as parseYaml } from "yaml";
import type {
  AiSkillMetadata,
  AiSkillRecord,
} from "../../lib/admin/ai-runtime-api";
import { isValidAgentSkillName } from "./agent-skill-name";

export interface SkillMetadataEntry {
  id: string;
  key: string;
  value: string;
}

export interface SkillDraft {
  allowed_tools: string[];
  body_markdown: string;
  compatibility: string;
  description: string;
  license: string;
  metadata_rows: SkillMetadataEntry[];
  module_id: string;
  name: string;
  title: string;
}

export interface ParsedSkillSourceDocument {
  draft: SkillDraft;
}

const ALLOWED_TOOLS_KEY = "allowed-tools";

function nextMetadataEntry(key = "", value = ""): SkillMetadataEntry {
  return {
    id: crypto.randomUUID(),
    key,
    value,
  };
}

function normalizeMarkdownText(value: string | null | undefined) {
  return (value ?? "").replace(/\r\n/g, "\n");
}

function getAllowedToolsFromDocument(
  record: Record<string, unknown>
): string[] {
  const raw = record[ALLOWED_TOOLS_KEY];
  if (typeof raw !== "string") {
    return [];
  }
  return raw
    .split(/\s+/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function buildDefaultSkillBodyMarkdown(input: {
  allowed_tools: string[];
  description: string;
  name: string;
  title: string;
}) {
  const heading = input.title.trim() || input.name.trim();
  const summary =
    input.description.trim() ||
    "Describe what this skill does and when to use it.";
  const allowedTools =
    input.allowed_tools.length > 0
      ? input.allowed_tools.map((tool) => `- \`${tool}\``).join("\n")
      : "- None";
  return [
    `# ${heading || "Untitled skill"}`,
    "",
    summary,
    "",
    "## When to use this skill",
    "",
    summary,
    "",
    "## Steps",
    "",
    "- Add the concrete steps an agent should follow.",
    "- Keep the highest-signal guidance in this file.",
    "- Move detailed reference material into linked files later.",
    "",
    "## Allowed tools",
    "",
    allowedTools,
  ].join("\n");
}

function orderedMetadataEntries(input: {
  metadata: AiSkillMetadata;
  metadata_order?: string[];
}) {
  const seen = new Set<string>();
  const orderedKeys = [...(input.metadata_order ?? [])].filter((key) => {
    const trimmed = key.trim();
    if (!trimmed || trimmed === "module_id" || !(trimmed in input.metadata)) {
      return false;
    }
    if (seen.has(trimmed)) {
      return false;
    }
    seen.add(trimmed);
    return true;
  });
  for (const key of Object.keys(input.metadata)) {
    if (key === "module_id" || seen.has(key)) {
      continue;
    }
    seen.add(key);
    orderedKeys.push(key);
  }
  return orderedKeys.map((key) =>
    nextMetadataEntry(key, input.metadata[key] ?? "")
  );
}

function formatYamlScalar(value: string | null | undefined) {
  if (!value) {
    return '""';
  }
  if (value.includes("\n")) {
    const body = value
      .split("\n")
      .map((line) => `  ${line}`)
      .join("\n");
    return `|\n${body}`;
  }
  if (/^[A-Za-z0-9._/-]+$/.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}

function buildMetadataFrontmatter(entries: SkillMetadataEntry[]) {
  if (entries.length === 0) {
    return null;
  }
  return [
    "metadata:",
    ...entries.map(
      (entry) => `  ${entry.key}: ${formatYamlScalar(entry.value)}`
    ),
  ].join("\n");
}

function parseFrontmatter(markdown: string) {
  const normalized = normalizeMarkdownText(markdown);
  if (!normalized.startsWith("---\n")) {
    return {
      body: normalized,
      frontmatter: {} as Record<string, unknown>,
    };
  }
  const closing = normalized.indexOf("\n---\n", 4);
  if (closing < 0) {
    throw new Error("Frontmatter is missing a closing --- line.");
  }
  const rawYaml = normalized.slice(4, closing);
  let parsed: unknown = {};
  if (rawYaml.trim()) {
    try {
      parsed = parseYaml(rawYaml);
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? error.message
          : "Frontmatter could not be parsed."
      );
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Frontmatter must be a YAML object.");
  }
  return {
    body: normalized.slice(closing + 5).replace(/^\n+/, ""),
    frontmatter: parsed as Record<string, unknown>,
  };
}

export function createEmptyMetadataEntry() {
  return nextMetadataEntry();
}

export function createSkillDraft(skill: AiSkillRecord): SkillDraft {
  return {
    allowed_tools: [...skill.allowed_tools],
    body_markdown:
      normalizeMarkdownText(skill.body_markdown) ||
      buildDefaultSkillBodyMarkdown({
        allowed_tools: skill.allowed_tools,
        description: skill.description ?? "",
        name: skill.name,
        title: skill.title ?? "",
      }),
    compatibility: skill.compatibility ?? "",
    description: skill.description ?? "",
    license: skill.license ?? "",
    metadata_rows: orderedMetadataEntries({
      metadata: skill.metadata,
      metadata_order: skill.metadata_order,
    }),
    module_id: skill.metadata.module_id?.trim() || "engenty-core",
    name: skill.name,
    title: skill.title ?? "",
  };
}

export function getSkillDraftMetadataPayload(rows: SkillMetadataEntry[]) {
  const metadata: AiSkillMetadata = {};
  const metadata_order: string[] = [];
  const duplicates = new Set<string>();
  const seen = new Set<string>();
  for (const row of rows) {
    const key = row.key.trim();
    if (!key) {
      continue;
    }
    if (seen.has(key)) {
      duplicates.add(key);
    }
    seen.add(key);
    metadata[key] = row.value;
    metadata_order.push(key);
  }
  return {
    duplicates: Array.from(duplicates.values()).sort(),
    metadata,
    metadata_order,
  };
}

export function validateSkillDraft(draft: SkillDraft) {
  if (!isValidAgentSkillName(draft.name.trim())) {
    return "Skill name must be a valid kebab-case Agent Skill id.";
  }
  const metadataPayload = getSkillDraftMetadataPayload(draft.metadata_rows);
  if (metadataPayload.duplicates.length > 0) {
    return `Metadata keys must be unique: ${metadataPayload.duplicates.join(", ")}`;
  }
  return null;
}

export function buildSkillSourceFromDraft(draft: SkillDraft) {
  const { metadata, metadata_order } = getSkillDraftMetadataPayload(
    draft.metadata_rows
  );
  const orderedMetadata = metadata_order.map((key) =>
    nextMetadataEntry(key, metadata[key] ?? "")
  );
  const frontmatterLines = [
    `name: ${formatYamlScalar(draft.name.trim())}`,
    draft.title.trim()
      ? `title: ${formatYamlScalar(draft.title.trim())}`
      : null,
    `description: ${formatYamlScalar(draft.description)}`,
    draft.license.trim()
      ? `license: ${formatYamlScalar(draft.license.trim())}`
      : null,
    draft.compatibility.trim()
      ? `compatibility: ${formatYamlScalar(draft.compatibility.trim())}`
      : null,
    buildMetadataFrontmatter([
      nextMetadataEntry("module_id", draft.module_id.trim() || "engenty-core"),
      ...orderedMetadata,
    ]),
    draft.allowed_tools.length > 0
      ? `allowed-tools: ${draft.allowed_tools.join(" ")}`
      : null,
  ].filter((line): line is string => Boolean(line));
  const body = normalizeMarkdownText(draft.body_markdown).replace(/\s+$/u, "");
  return `${["---", ...frontmatterLines, "---", "", body].join("\n").trimEnd()}\n`;
}

export function parseSkillSourceToDraft(
  markdown: string,
  fallback: SkillDraft
): ParsedSkillSourceDocument {
  const { body, frontmatter } = parseFrontmatter(markdown);
  const metadataValue = frontmatter.metadata;
  const metadataRecord =
    metadataValue &&
    typeof metadataValue === "object" &&
    !Array.isArray(metadataValue)
      ? (metadataValue as Record<string, unknown>)
      : {};
  const metadataRows = Object.entries(metadataRecord)
    .filter(([key]) => key !== "module_id")
    .map(([key, value]) => nextMetadataEntry(key, String(value ?? "")));
  const nextDraft: SkillDraft = {
    allowed_tools: getAllowedToolsFromDocument(frontmatter),
    body_markdown: body,
    compatibility:
      typeof frontmatter.compatibility === "string"
        ? frontmatter.compatibility
        : "",
    description:
      typeof frontmatter.description === "string"
        ? frontmatter.description
        : "",
    license: typeof frontmatter.license === "string" ? frontmatter.license : "",
    metadata_rows: metadataRows,
    module_id: fallback.module_id,
    name:
      typeof frontmatter.name === "string" && frontmatter.name.trim()
        ? frontmatter.name.trim()
        : fallback.name,
    title: typeof frontmatter.title === "string" ? frontmatter.title : "",
  };
  return { draft: nextDraft };
}
