/**
 * OKF Markdown = YAML frontmatter block delimited by `---`, followed by the
 * Markdown body. Thin wrappers over the `yaml` package so callers never touch
 * the delimiter parsing themselves.
 */

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export interface OkfDocument {
  body: string;
  frontmatter: Record<string, unknown>;
}

/** Serialise frontmatter + body into an OKF Markdown string. */
export function serializeOkf(
  frontmatter: Record<string, unknown>,
  body: string
): string {
  // `null`/`undefined` values are dropped so the file stays clean.
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(frontmatter)) {
    if (value !== undefined && value !== null) {
      clean[key] = value;
    }
  }
  const yaml = stringifyYaml(clean).trimEnd();
  return `---\n${yaml}\n---\n\n${body.trimEnd()}\n`;
}

/** Parse an OKF Markdown string. Missing/invalid frontmatter yields `{}`. */
export function parseOkf(text: string): OkfDocument {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!match) {
    return { frontmatter: {}, body: text.trim() };
  }
  let frontmatter: Record<string, unknown> = {};
  try {
    const parsed = parseYaml(match[1]);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      frontmatter = parsed as Record<string, unknown>;
    }
  } catch {
    // Malformed frontmatter — treat as empty rather than failing the import.
  }
  return { frontmatter, body: (match[2] ?? "").trim() };
}
