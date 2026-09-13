/**
 * Comment-preserving .env document model. `loadDotEnv` (packages/environment) is
 * for reading values; writing goes through this model so comments, blank lines,
 * ordering, and unknown keys survive untouched.
 */

/** Exact markers from scripts/dev-env-urls.mjs — sync scripts own the block. */
export const PORTLESS_MARKER_START =
  "# --- engenty dev URLs (pnpm dev:urls:localhost or pnpm dev:urls:portless) ---";
export const PORTLESS_MARKER_END = "# --- end engenty dev URLs ---";

const LEGACY_PORTLESS_MARKER_START =
  "# --- engenty dev URLs (portless.json; pnpm dev:urls:portless) ---";

function isDevUrlMarkerStart(trimmed: string): boolean {
  return (
    trimmed === PORTLESS_MARKER_START ||
    trimmed === LEGACY_PORTLESS_MARKER_START ||
    trimmed.startsWith("# --- engenty dev URLs")
  );
}

export type EnvDocLine =
  | { type: "blank"; raw: string }
  | { portlessMarker?: boolean; raw: string; type: "comment" }
  | {
      key: string;
      /** True when the entry sits inside the portless marker block (never edit). */
      portlessOwned: boolean;
      /** Raw source including quotes; spans multiple lines for quoted multiline values. */
      raw: string;
      type: "entry";
      value: string;
    };

export interface EnvDocument {
  lines: EnvDocLine[];
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export function parseEnvDocument(text: string): EnvDocument {
  const lines = text.split(/\r?\n/);
  // A trailing "\n" yields one final empty element that is an artifact, not a blank line.
  if (lines.length > 0 && lines.at(-1) === "") {
    lines.pop();
  }
  const doc: EnvDocument = { lines: [] };
  let inPortlessBlock = false;

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();
    i++;

    if (trimmed === "") {
      doc.lines.push({ raw, type: "blank" });
      continue;
    }
    if (trimmed.startsWith("#")) {
      if (isDevUrlMarkerStart(trimmed)) {
        inPortlessBlock = true;
        doc.lines.push({ portlessMarker: true, raw, type: "comment" });
        continue;
      }
      if (trimmed === PORTLESS_MARKER_END) {
        inPortlessBlock = false;
        doc.lines.push({ portlessMarker: true, raw, type: "comment" });
        continue;
      }
      doc.lines.push({ raw, type: "comment" });
      continue;
    }

    let assignment = trimmed;
    if (assignment.startsWith("export ")) {
      assignment = assignment.slice(7).trim();
    }
    const eq = assignment.indexOf("=");
    if (eq <= 0) {
      // Not a valid assignment — preserve verbatim.
      doc.lines.push({ raw, type: "comment" });
      continue;
    }

    const key = assignment.slice(0, eq).trim();
    let valueRaw = assignment.slice(eq + 1).trim();
    const rawParts = [raw];

    const quote = valueRaw[0];
    if ((quote === '"' || quote === "'") && !valueRaw.endsWith(quote)) {
      // Multiline quoted value (e.g. a PEM) — consume until the closing quote.
      const valueParts = [valueRaw.slice(1)];
      while (i < lines.length) {
        const nextLine = lines[i];
        i++;
        rawParts.push(nextLine);
        if (nextLine.trimEnd().endsWith(quote)) {
          valueParts.push(nextLine.trimEnd().slice(0, -1));
          break;
        }
        valueParts.push(nextLine);
      }
      valueRaw = valueParts.join("\n");
      doc.lines.push({
        key,
        portlessOwned: inPortlessBlock,
        raw: rawParts.join("\n"),
        type: "entry",
        value: valueRaw,
      });
      continue;
    }

    doc.lines.push({
      key,
      portlessOwned: inPortlessBlock,
      raw,
      type: "entry",
      value: unquote(valueRaw),
    });
  }

  return doc;
}

export function serializeEnvDocument(doc: EnvDocument): string {
  const text = doc.lines.map((line) => line.raw).join("\n");
  return text.length === 0 ? "" : `${text}\n`;
}

/** Last entry wins, mirroring loadDotEnv's sequential override order. */
export function getValue(doc: EnvDocument, key: string): string | undefined {
  for (let i = doc.lines.length - 1; i >= 0; i--) {
    const line = doc.lines[i];
    if (line.type === "entry" && line.key === key) {
      return line.value;
    }
  }
  return;
}

export function hasKey(doc: EnvDocument, key: string): boolean {
  return doc.lines.some((line) => line.type === "entry" && line.key === key);
}

export function isPortlessOwned(doc: EnvDocument, key: string): boolean {
  let owned = false;
  for (const line of doc.lines) {
    if (line.type === "entry" && line.key === key) {
      owned = line.portlessOwned;
    }
  }
  return owned;
}

/** Map view of all entries (last entry wins). */
export function documentEntries(doc: EnvDocument): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of doc.lines) {
    if (line.type === "entry") {
      out.set(line.key, line.value);
    }
  }
  return out;
}

function formatValue(value: string): string {
  if (value.includes("\n")) {
    return `"${value}"`;
  }
  if (/[#\s"']/.test(value)) {
    return `"${value}"`;
  }
  return value;
}

export interface SetValueOptions {
  /** Comment lines (without leading "#") inserted above a newly appended key. */
  commentLines?: readonly string[];
}

/**
 * Update the last non-portless entry for `key` in place, or append at the end.
 * Throws for portless-owned keys — those belong to pnpm dev:urls:portless.
 */
export function setValue(
  doc: EnvDocument,
  key: string,
  value: string,
  options: SetValueOptions = {}
): void {
  let target: Extract<EnvDocLine, { type: "entry" }> | undefined;
  let sawPortlessOwned = false;
  for (const line of doc.lines) {
    if (line.type !== "entry" || line.key !== key) {
      continue;
    }
    if (line.portlessOwned) {
      sawPortlessOwned = true;
      continue;
    }
    target = line;
  }

  if (target) {
    target.value = value;
    target.raw = `${key}=${formatValue(value)}`;
    return;
  }
  if (sawPortlessOwned) {
    throw new Error(
      `${key} is managed by the dev URL block — run pnpm dev:urls:localhost or pnpm dev:urls:portless instead.`
    );
  }

  if (doc.lines.length > 0 && doc.lines.at(-1)?.type !== "blank") {
    doc.lines.push({ raw: "", type: "blank" });
  }
  for (const comment of options.commentLines ?? []) {
    doc.lines.push({ raw: `# ${comment}`, type: "comment" });
  }
  doc.lines.push({
    key,
    portlessOwned: false,
    raw: `${key}=${formatValue(value)}`,
    type: "entry",
    value,
  });
}

export function hasPortlessBlock(doc: EnvDocument): boolean {
  return doc.lines.some(
    (line) => line.type === "comment" && line.portlessMarker === true
  );
}
