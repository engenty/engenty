import type { ResolvedAgentStarter } from "@engenty/ai-core";

// Generated starter chips come back as plain lines, `<label> | <prompt>`, so a
// small model never has to produce JSON. Limits mirror `agentStarterSchema`.
const MAX_LABEL_CHARS = 48;
const MAX_PROMPT_CHARS = 400;
const MAX_ID_CHARS = 64;

const LIST_MARKER = /^\s*(?:[-*•+]|\d+[.)])\s+/;

function unwrap(value: string): string {
  return value
    .trim()
    .replace(/^\*\*(.*)\*\*$/, "$1")
    .replace(/^["'`“„](.*)["'`”“]$/, "$1")
    .trim();
}

function clamp(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

/** Stable id from the label; `generated_` keeps it apart from declared ids. */
function starterId(label: string): string {
  const slug = label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `generated_${slug || "starter"}`.slice(0, MAX_ID_CHARS);
}

/**
 * Parse `<label> | <prompt>` lines. Tolerates list markers, quotes, bold and a
 * wrapping code fence; skips blank lines and intro lines ending in ":". A line
 * without a separator counts only when it is short enough to be a label, and
 * then doubles as its prompt.
 */
export function parseGeneratedStarterLines(
  text: string,
  max: number
): ResolvedAgentStarter[] {
  const starters: ResolvedAgentStarter[] = [];
  const seen = new Set<string>();
  for (const raw of text.split("\n")) {
    const line = raw.replace(LIST_MARKER, "").trim();
    if (!line || line.startsWith("```") || line.endsWith(":")) {
      continue;
    }
    const separator = line.indexOf("|");
    const label = unwrap(separator >= 0 ? line.slice(0, separator) : line);
    const prompt = unwrap(separator >= 0 ? line.slice(separator + 1) : line);
    if (!(label && prompt)) {
      continue;
    }
    if (separator < 0 && label.length > MAX_LABEL_CHARS) {
      continue;
    }
    const id = starterId(label);
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    starters.push({
      id,
      label: clamp(label, MAX_LABEL_CHARS),
      prompt: clamp(prompt, MAX_PROMPT_CHARS),
    });
    if (starters.length >= max) {
      break;
    }
  }
  return starters;
}
