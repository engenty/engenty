import { parse as parseYaml } from "yaml";
import type { AiSkillMetadata } from "../../lib/admin/ai-runtime-api";

export interface SkillMarkdownPreviewInput {
  allowed_tools: string[];
  compatibility: string | null;
  description: string | null;
  license: string | null;
  metadata: AiSkillMetadata;
  name: string;
}

export function stripMarkdownFrontmatter(markdown: string) {
  const normalized = markdown.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return normalized;
  }

  const closing = normalized.indexOf("\n---\n", 4);
  if (closing < 0) {
    return normalized;
  }

  return normalized.slice(closing + 5).trimStart();
}

const ALLOWED_TOOLS_KEY = "allowed-tools";

function formatFrontmatterScalar(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).join(", ");
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function collectAllowedToolsFromDoc(doc: Record<string, unknown>): string[] {
  const raw = doc[ALLOWED_TOOLS_KEY];
  if (typeof raw !== "string") {
    return [];
  }
  return raw.split(/\s+/u).filter(Boolean);
}

export interface SkillFrontmatterPreviewModel {
  allowedTools: string[];
  metadataLines: { key: string; value: string }[];
  /** Top-level YAML entries except `metadata` and allowed-tools keys. */
  primaryLines: { key: string; value: string }[];
}

/**
 * Parses leading `---` YAML for the skill markdown preview card.
 * Returns `null` when there is no frontmatter or parsing fails.
 */
export function parseSkillFrontmatterPreview(
  markdown: string
): SkillFrontmatterPreviewModel | null {
  const normalized = markdown.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return null;
  }
  const closing = normalized.indexOf("\n---\n", 4);
  if (closing < 0) {
    return null;
  }
  const rawYaml = normalized.slice(4, closing);
  if (!rawYaml.trim()) {
    return null;
  }
  let doc: unknown;
  try {
    doc = parseYaml(rawYaml);
  } catch {
    return null;
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    return null;
  }
  const record = doc as Record<string, unknown>;
  const allowedTools = collectAllowedToolsFromDoc(record);
  const metadataRaw = record.metadata;
  const metadataLines: { key: string; value: string }[] = [];
  if (
    metadataRaw &&
    typeof metadataRaw === "object" &&
    !Array.isArray(metadataRaw)
  ) {
    for (const [key, value] of Object.entries(metadataRaw)) {
      metadataLines.push({ key, value: formatFrontmatterScalar(value) });
    }
  }

  const primaryLines: { key: string; value: string }[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (key === "metadata") {
      continue;
    }
    if (key === ALLOWED_TOOLS_KEY) {
      continue;
    }
    primaryLines.push({ key, value: formatFrontmatterScalar(value) });
  }

  const hasAny =
    primaryLines.length > 0 ||
    metadataLines.length > 0 ||
    allowedTools.length > 0;
  if (!hasAny) {
    return null;
  }

  return { allowedTools, metadataLines, primaryLines };
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

function formatYamlStringList(values: string[]) {
  if (values.length === 0) {
    return "[]";
  }

  return `\n${values.map((value) => `  - ${JSON.stringify(value)}`).join("\n")}`;
}

function formatMetadata(metadata: AiSkillMetadata) {
  const entries = Object.entries(metadata);
  if (entries.length === 0) {
    return "{}";
  }

  return `\n${entries
    .map(([key, value]) => `  ${key}: ${formatYamlScalar(value)}`)
    .join("\n")}`;
}

function formatBulletList(values: string[]) {
  if (values.length === 0) {
    return "- None";
  }

  return values.map((value) => `- \`${value}\``).join("\n");
}

export function buildSkillMarkdownPreview(input: SkillMarkdownPreviewInput) {
  const title = input.name.trim();
  const summary =
    input.description?.trim() ||
    "Describe what this skill does and when to use it.";

  return [
    "---",
    `name: ${formatYamlScalar(title)}`,
    `description: ${formatYamlScalar(input.description)}`,
    input.license ? `license: ${formatYamlScalar(input.license)}` : null,
    input.compatibility
      ? `compatibility: ${formatYamlScalar(input.compatibility)}`
      : null,
    Object.keys(input.metadata).length > 0
      ? `metadata:${formatMetadata(input.metadata)}`
      : null,
    input.allowed_tools.length > 0
      ? `allowed-tools: ${input.allowed_tools.join(" ")}`
      : null,
    "---",
    "",
    `# ${title}`,
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
    formatBulletList(input.allowed_tools),
  ]
    .filter((line) => line !== null)
    .join("\n");
}
