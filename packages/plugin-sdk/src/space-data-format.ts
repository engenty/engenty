/**
 * Serialisations the space Data tree speaks (PLAN-space-data.md decision 1).
 *
 * There is no single record format — a node is a file of some TYPE — but the
 * few formats adapters share are worth having in one place rather than four:
 * frontmatter markdown (the `.contact.md` shape, in the Open Knowledge
 * Format the retired kb-filesystem-sync module established), folder index files, and the CSV
 * projection collection views read.
 *
 * Split from `space-data.ts` so the browser bundle keeps the types without the
 * YAML parser: the UI renders text the server already serialised and never
 * needs to parse it.
 */

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { PluginOperationError } from "./operation-error.js";

export interface FrontmatterDocument {
  body: string;
  frontmatter: Record<string, unknown>;
}

/**
 * `---\n<yaml>\n---\n\n<body>` — deliberately byte-identical to the OKF shape
 * the retired kb-filesystem-sync module wrote, so a tree exported from here
 * reads the same as any pre-existing OKF mirror (D5 folded one into the other).
 *
 * Null and undefined are dropped rather than written as `null`: a contact with
 * no phone should have no `phone:` line, or every round-trip through a text
 * editor grows the file.
 */
export function serializeFrontmatter(
  frontmatter: Record<string, unknown>,
  body: string
): string {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(frontmatter)) {
    if (value !== undefined && value !== null) {
      clean[key] = value;
    }
  }
  const yaml = stringifyYaml(clean).trimEnd();
  return `---\n${yaml}\n---\n\n${body.trimEnd()}\n`;
}

/**
 * Parse frontmatter markdown.
 *
 * A malformed block THROWS here, unlike the importer's forgiving read: this
 * parses what a human or an agent just wrote and is about to be saved as a
 * record. Silently treating a typo'd `---` block as an empty frontmatter would
 * blank every field the writer meant to keep — the quiet data loss this whole
 * design exists to avoid.
 */
export function parseFrontmatter(text: string): FrontmatterDocument {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!match) {
    return { body: text.trim(), frontmatter: {} };
  }
  let parsed: unknown;
  try {
    parsed = parseYaml(match[1] ?? "");
  } catch (error) {
    throw new PluginOperationError(
      "invalid_frontmatter",
      `The frontmatter block is not valid YAML: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { status: 400 }
    );
  }
  if (
    parsed !== null &&
    (typeof parsed !== "object" || Array.isArray(parsed))
  ) {
    throw new PluginOperationError(
      "invalid_frontmatter",
      "The frontmatter block must be a mapping of fields.",
      { status: 400 }
    );
  }
  return {
    body: (match[2] ?? "").trim(),
    frontmatter: (parsed as Record<string, unknown> | null) ?? {},
  };
}

export interface SpaceDataFolderIndex {
  description?: string;
  fields: Record<string, unknown>;
  title?: string;
}

/** `index.md` — the human face of a folder: fields above, prose below. */
export function serializeFolderIndexMarkdown(
  index: SpaceDataFolderIndex
): string {
  return serializeFrontmatter(
    { ...index.fields, ...(index.title ? { title: index.title } : {}) },
    index.description ?? ""
  );
}

/**
 * Read a folder's metadata from whichever index file it has.
 *
 * When both exist, `index.json` supplies the structured fields and `index.md`'s
 * BODY supplies the description — the precedence decision 3 settled, kept here
 * so every reader of a folder agrees about it.
 */
export function readFolderIndex(input: {
  json?: string | null;
  markdown?: string | null;
}): SpaceDataFolderIndex {
  const fromMarkdown = input.markdown ? parseFrontmatter(input.markdown) : null;
  let fields: Record<string, unknown> = fromMarkdown?.frontmatter ?? {};
  if (input.json) {
    try {
      const parsed: unknown = JSON.parse(input.json);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        fields = { ...fields, ...(parsed as Record<string, unknown>) };
      }
    } catch {
      // A folder whose index.json is corrupt still lists its contents; the
      // metadata is decoration, the tree is the point.
    }
  }
  const description =
    fromMarkdown?.body ||
    (typeof fields.description === "string" ? fields.description : undefined);
  const title = typeof fields.title === "string" ? fields.title : undefined;
  return {
    fields,
    ...(description ? { description } : {}),
    ...(title ? { title } : {}),
  };
}

/**
 * RFC-4180 CSV of a list of flat records, for collection views.
 *
 * Read-only ergonomics: writing one back is a BULK operation with a count in
 * the approval card, never a silent save (PLAN-space-data.md §1b).
 */
export function serializeCsv(
  columns: readonly string[],
  rows: readonly Record<string, unknown>[]
): string {
  const cell = (value: unknown): string => {
    if (value === null || value === undefined) {
      return "";
    }
    const text = Array.isArray(value)
      ? value.map((item) => String(item)).join("; ")
      : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => cell(row[column])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Parse a CSV back into rows keyed by the header line.
 *
 * Minimal and strict: quoted fields with embedded quotes, commas and newlines,
 * and nothing else. A spreadsheet dialect we cannot read is better refused at
 * the import preview than half-applied to records.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let index = 0;
  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    if (row.length > 1 || row[0] !== "") {
      rows.push(row);
    }
    row = [];
  };
  while (index < text.length) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        quoted = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }
    if (char === '"' && field === "") {
      quoted = true;
      index += 1;
      continue;
    }
    if (char === ",") {
      pushField();
      index += 1;
      continue;
    }
    if (char === "\n" || char === "\r") {
      pushRow();
      index += text[index] === "\r" && text[index + 1] === "\n" ? 2 : 1;
      continue;
    }
    field += char;
    index += 1;
  }
  if (field !== "" || row.length > 0) {
    pushRow();
  }
  const header = rows.shift();
  if (!header) {
    return [];
  }
  return rows.map((values) => {
    const record: Record<string, string> = {};
    header.forEach((column, position) => {
      record[column] = values[position] ?? "";
    });
    return record;
  });
}

/**
 * A filename stem for a record: readable, stable-ish, and safe on every
 * filesystem the tree may be exported to.
 *
 * "Stable-ish" is honest — the stem follows the record's title, so a rename in
 * the module renames the file. That is fine BECAUSE identity is the record id
 * carried inside the file, never the path (PLAN-space-data.md §1b).
 */
/**
 * The separator between a node's readable stem and its record id.
 *
 * The id is IN the filename, and that is a deliberate trade. Identity is the
 * record id (§1b), so a path has to carry it or resolving one costs a scan —
 * the Cabinet failure mode this design exists to avoid, and one that gets
 * worse exactly as a tenant's address book grows. A double underscore is legal
 * on every filesystem the tree may be exported to, survives a round trip
 * through S3 and Google Drive, and reads as a seam rather than as part of the
 * name.
 */
export const SPACE_DATA_ID_SEPARATOR = "__";

/** `acme-gmbh__<uuid>.contact.md` — readable stem, exact identity. */
export function spaceDataNodeName(input: {
  extension: string;
  recordId: string;
  title: string;
}): string {
  const stem = spaceDataSlug(input.title, "untitled");
  return `${stem}${SPACE_DATA_ID_SEPARATOR}${input.recordId}${input.extension}`;
}

/**
 * The record id a node name carries, or null when the name does not carry one.
 *
 * Null is a 404, never a guess: a path that names no record is a path the
 * caller invented, and searching for something that looks like it would open a
 * different record than the one they asked for.
 */
export function spaceDataNodeRecordId(
  name: string,
  extension: string
): string | null {
  if (!name.endsWith(extension)) {
    return null;
  }
  // `slice(0, -0)` is `slice(0, 0)` — the empty string, not the whole name. So
  // an extension-less segment (a folder that carries an id, e.g. a knowledge
  // base's `handbook__<id>`) would silently resolve to "no id at all", which
  // reads as a 404 for a path that is perfectly well formed.
  const stem = extension ? name.slice(0, -extension.length) : name;
  const index = stem.lastIndexOf(SPACE_DATA_ID_SEPARATOR);
  if (index === -1) {
    return null;
  }
  const id = stem.slice(index + SPACE_DATA_ID_SEPARATOR.length);
  return id.length > 0 ? id : null;
}

/**
 * A path segment, as a person should read it.
 *
 * The id in a name is what makes a path resolvable without a scan, and it is
 * also unreadable: `kuesten-wissen-2__019fea6b-141a-756b-847d-93c3f7dd5a2d` in
 * a breadcrumb tells the reader nothing they wanted. Everything from the last
 * `__` on is machinery, so it goes.
 *
 * The readable half is a SLUG, not a title — `sicherheit-an-bord`, not
 * "Sicherheit an Bord" — and this makes no attempt to un-slug it, because
 * capitalisation and umlauts cannot be recovered. Where a real title is
 * available it belongs on `SpaceDataEntry.title` and should be preferred; this
 * is for the places that have only a path.
 */
export function spaceDataSegmentLabel(segment: string): string {
  const index = segment.lastIndexOf(SPACE_DATA_ID_SEPARATOR);
  return index === -1 ? segment : segment.slice(0, index);
}

export function spaceDataSlug(input: string, fallback: string): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || fallback;
}
