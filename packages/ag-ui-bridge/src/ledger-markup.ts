export type LedgerMarkupPart =
  | { arg: string | null; kind: "tag"; name: string }
  | { kind: "text"; value: string };

export function parseLedgerMarkup(text: string): LedgerMarkupPart[] {
  const tagRe = /\[([^\]:\n]+)(?::\s*([^\]]+))?\]/g;
  const parts: LedgerMarkupPart[] = [];
  let cursor = 0;
  for (const match of text.matchAll(tagRe)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      parts.push({ kind: "text", value: text.slice(cursor, index) });
    }
    parts.push({
      arg: match[2]?.trim() || null,
      kind: "tag",
      name: match[1]?.trim() ?? "",
    });
    cursor = index + match[0].length;
  }
  if (cursor < text.length) {
    parts.push({ kind: "text", value: text.slice(cursor) });
  }
  return parts;
}

export function isLedgerMetaLine(line: string): boolean {
  return /^(id|speaker|author)\s{2,}/.test(line) || /^\d+ chars$/.test(line);
}

export function splitLedgerDetail(detail: string): {
  body: string;
  meta: string[];
} {
  const lines = detail.split("\n");
  const meta: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line === "") {
      index += 1;
      break;
    }
    if (!isLedgerMetaLine(line)) {
      break;
    }
    meta.push(line);
    index += 1;
  }
  return { body: lines.slice(index).join("\n"), meta };
}

export function ledgerTagTone(name: string): "muted" | "reasoning" | "tool" {
  const key = name.trim().toLowerCase();
  if (key === "tool-invocation" || key === "tool_call" || key === "tool") {
    return "tool";
  }
  if (key === "reasoning") {
    return "reasoning";
  }
  return "muted";
}

/**
 * Tool results sometimes land as a JSON string token (`"# Title\\n\\nBody"`)
 * or as text with literal `\\n` escapes. Unfold those before display.
 */
export function unwrapLedgerText(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return value;
  }
  if (trimmed.startsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "string") {
        return parsed;
      }
    } catch {
      // Quoted but not a JSON string — fall through.
    }
  }
  if (trimmed.includes("\\n") && !trimmed.includes("\n")) {
    return trimmed
      .replace(/\\r\\n/g, "\n")
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
  return value;
}

export function ledgerTextAsCode(value: string): string {
  const text = unwrapLedgerText(value);
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      return text;
    }
  }
  return text;
}

export function ledgerTextAsMarkdown(value: string): string {
  const text = unwrapLedgerText(value);
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return `\`\`\`json\n${JSON.stringify(JSON.parse(trimmed), null, 2)}\n\`\`\``;
    } catch {
      return text;
    }
  }
  return text;
}
