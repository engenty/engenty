"use client";

export function readStringField(obj: unknown, keys: string[]): string | null {
  if (!obj || typeof obj !== "object") {
    return null;
  }
  for (const key of keys) {
    if (!(key in obj)) {
      continue;
    }
    const value = (obj as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return null;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/** Prefer execution payload over catalog metadata for engenty_tool_execute cards. */
export function unwrapEngentyToolExecuteOutput(
  toolName: string,
  output: unknown
): unknown {
  if (toolName !== "engenty_tool_execute") {
    return output;
  }
  const record = asRecord(output);
  if (!record) {
    return output;
  }
  if (record.ok === true && record.data !== undefined) {
    return record.data;
  }
  if (record.tool !== undefined) {
    const { tool: _tool, ...rest } = record;
    return rest;
  }
  return output;
}

export function toHumanValue(value: unknown): string | null {
  const clamp = (text: string, max = 200) =>
    text.length > max ? `${text.slice(0, max - 1)}…` : text;
  const objectPreview = (item: Record<string, unknown>): string | null => {
    const key =
      toHumanValue(item.field) ??
      toHumanValue(item.key) ??
      toHumanValue(item.name) ??
      toHumanValue(item.title);
    const val =
      toHumanValue(item.value) ??
      toHumanValue(item.result) ??
      toHumanValue(item.id) ??
      toHumanValue(item.url);
    if (key && val) {
      return clamp(`${key}=${val}`, 120);
    }
    if (key) {
      return clamp(key, 120);
    }
    try {
      return clamp(JSON.stringify(item), 160);
    } catch {
      return null;
    }
  };

  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return value.trim() || null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    const flat = value
      .map((item) => {
        if (typeof item === "string") {
          return item.trim();
        }
        if (typeof item === "number" || typeof item === "boolean") {
          return String(item);
        }
        const record = asRecord(item);
        if (record) {
          return objectPreview(record);
        }
        try {
          return JSON.stringify(item);
        } catch {
          return String(item);
        }
      })
      .filter(Boolean);
    return flat.length > 0 ? clamp(flat.join(", ")) : null;
  }
  if (typeof value === "object") {
    const record = asRecord(value);
    if (record) {
      return objectPreview(record);
    }
    try {
      return clamp(JSON.stringify(value));
    } catch {
      return null;
    }
  }
  return null;
}

export function findFirstStringDeep(
  value: unknown,
  keys: string[]
): string | null {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  const seen = new Set<unknown>();
  const queue: unknown[] = [value];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object") {
      continue;
    }
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);

    if (Array.isArray(current)) {
      for (const item of current) {
        queue.push(item);
      }
      continue;
    }

    for (const [key, child] of Object.entries(current)) {
      if (
        wanted.has(key.toLowerCase()) &&
        typeof child === "string" &&
        child.trim().length > 0
      ) {
        return child.trim();
      }
      if (child && typeof child === "object") {
        queue.push(child);
      }
    }
  }

  return null;
}

export function formatHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

// A tool can "succeed" at the harness level (output present) while its payload is
// actually a validation/error result — e.g. a Zod issue array from a bad arg. Detect
// those so the timeline shows an error step instead of a misleading green check.
function zodIssueMessages(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const messages: string[] = [];
  for (const item of value) {
    const record = asRecord(item);
    const message = record?.message;
    if (
      !(
        record &&
        typeof message === "string" &&
        ("code" in record || "path" in record)
      )
    ) {
      return null; // not a uniform issue array — leave it alone
    }
    messages.push(message);
  }
  return messages.join("; ");
}

/** True when a string looks like serialized JSON (object/array), not prose. */
export function looksLikeJsonBlob(text: string): boolean {
  const trimmed = text.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) {
    return false;
  }
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

/**
 * Tool results often arrive as JSON strings (AG-UI TOOL_CALL_RESULT content).
 * Parse them so snippet/error helpers see structured output instead of a blob.
 */
export function coerceToolOutput(output: unknown): unknown {
  if (typeof output !== "string") {
    return output;
  }
  const trimmed = output.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) {
    return output;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return output;
  }
}

export function detectToolOutputError(output: unknown): string | null {
  const coerced = coerceToolOutput(output);
  const direct = zodIssueMessages(coerced);
  if (direct) {
    return direct;
  }
  const record = asRecord(coerced);
  if (!record) {
    return null;
  }
  const nested = zodIssueMessages(record.errors ?? record.issues);
  if (nested) {
    return nested;
  }
  if (record.ok === false) {
    return readStringField(record, ["error", "message"]) ?? "Tool call failed";
  }
  if (typeof record.error === "string" && record.error.trim()) {
    return record.error.trim();
  }
  return null;
}

// Only genuine prose belongs in the timeline snippet — a real sentence from a
// message/summary field, not an ID dump or stringified JSON. Requiring whitespace
// filters bare IDs; the full structured output stays in the expandable ToolCallCard.
const PROSE_OUTPUT_KEYS = [
  "summary",
  "message",
  "text",
  "content",
  "description",
  "note",
  "stdout",
] as const;

/**
 * The workspace file-read protocol: a `path (N bytes)` header and/or numbered
 * `1->` content lines. It is tool OUTPUT, not prose, but it has whitespace and
 * does not start with `{`/`[`, so `looksLikeJsonBlob` waved it through and a
 * 224 KB JSON file landed in the always-visible timeline body under "Ran tool".
 * The dump still belongs in the expandable card detail — only the CoT snippet
 * has to refuse it.
 *
 * Both arrow spellings are matched: fixtures use ASCII `->`, and a ligature
 * font renders that as `→`, so the two are easy to confuse when reading a
 * screenshot.
 */
const FILE_DUMP_HEADER = /^.*\(\s*\d+\s*bytes\s*\)\s*$/m;
const FILE_DUMP_LINE = /^\s*\d+\s*(?:->|→)/m;

export function looksLikeNumberedFileDump(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  if (FILE_DUMP_LINE.test(trimmed)) {
    return true;
  }
  return FILE_DUMP_HEADER.test(trimmed.split("\n")[0] ?? "");
}

function isUsableProse(text: string): boolean {
  const trimmed = text.trim();
  return Boolean(
    trimmed &&
      /\s/.test(trimmed) &&
      !looksLikeJsonBlob(trimmed) &&
      !looksLikeNumberedFileDump(trimmed)
  );
}

export function extractProseSnippet(output: unknown): string | null {
  const coerced = coerceToolOutput(output);
  if (typeof coerced === "string") {
    return isUsableProse(coerced) ? coerced.trim() : null;
  }
  const record = asRecord(coerced);
  if (!record) {
    return null;
  }
  // engenty_tool_execute wraps `{ ok, data }` — prefer the inner payload.
  const dataRecord = asRecord(record.data);
  const proseRoots = dataRecord ? [record, dataRecord] : [record];
  for (const root of proseRoots) {
    for (const key of PROSE_OUTPUT_KEYS) {
      const value = root[key];
      if (typeof value === "string" && isUsableProse(value)) {
        return value.trim();
      }
    }
    // MCP tool results carry text under `content: [{type:"text", text}]`
    // (imported external connectors, MCP apps) — surface the first text block.
    if (Array.isArray(root.content)) {
      for (const item of root.content) {
        const block = asRecord(item);
        if (
          block?.type === "text" &&
          typeof block.text === "string" &&
          isUsableProse(block.text)
        ) {
          return block.text.trim();
        }
      }
    }
  }
  return null;
}

const IMAGE_URL_KEYS = new Set([
  "image",
  "image_url",
  "imageurl",
  "screenshot",
  "thumbnail",
  "photo",
  "picture",
  "avatar",
  "src",
]);
const IMAGE_LIST_KEYS = new Set(["images", "photos", "screenshots"]);
const IMAGE_CAPTION_KEYS = ["caption", "alt", "title", "description", "label"];

function isImageUrl(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim();
  if (trimmed.startsWith("data:image/")) {
    return true;
  }
  return (
    /^https?:\/\//i.test(trimmed) &&
    /\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i.test(trimmed)
  );
}

/** Walk tool output for renderable images (URLs or `{url, caption}` records). */
export function collectToolImages(
  output: unknown
): Array<{ caption: string | null; url: string }> {
  const images: Array<{ caption: string | null; url: string }> = [];
  const seenUrls = new Set<string>();
  const seenNodes = new Set<unknown>();
  const queue: unknown[] = [output];

  const push = (url: string, caption: string | null) => {
    const trimmed = url.trim();
    if (!trimmed || seenUrls.has(trimmed)) {
      return;
    }
    seenUrls.add(trimmed);
    images.push({ url: trimmed, caption });
  };

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object") {
      continue;
    }
    if (seenNodes.has(current)) {
      continue;
    }
    seenNodes.add(current);

    if (Array.isArray(current)) {
      for (const item of current) {
        if (isImageUrl(item)) {
          push(item, null);
        } else {
          queue.push(item);
        }
      }
      continue;
    }

    const record = current as Record<string, unknown>;
    // A record that itself describes an image: { url, caption }
    const recordUrl = record.url ?? record.href ?? record.src;
    if (isImageUrl(recordUrl)) {
      push(
        recordUrl as string,
        findFirstStringDeep(record, IMAGE_CAPTION_KEYS)
      );
    }
    // MCP image content blocks carry inline base64: {type:"image", data, mimeType}
    // (imported external connectors, MCP apps).
    if (
      record.type === "image" &&
      typeof record.data === "string" &&
      record.data.length > 0 &&
      !record.data.startsWith("data:")
    ) {
      const mimeType =
        typeof record.mimeType === "string" && record.mimeType
          ? record.mimeType
          : "image/png";
      push(`data:${mimeType};base64,${record.data}`, null);
    }

    for (const [key, child] of Object.entries(record)) {
      const lowerKey = key.toLowerCase();
      if (IMAGE_URL_KEYS.has(lowerKey) && isImageUrl(child)) {
        push(child, findFirstStringDeep(record, IMAGE_CAPTION_KEYS));
        continue;
      }
      if (IMAGE_LIST_KEYS.has(lowerKey) && Array.isArray(child)) {
        for (const item of child) {
          if (isImageUrl(item)) {
            push(item, null);
          } else {
            queue.push(item);
          }
        }
        continue;
      }
      if (child && typeof child === "object") {
        queue.push(child);
      }
    }
  }

  return images;
}

export function collectWebSearchResults(output: unknown): Array<{
  title: string | null;
  url: string | null;
}> {
  const resultArrays: unknown[][] = [];
  const seen = new Set<unknown>();
  const queue: unknown[] = [output];
  const resultKeys = new Set([
    "results",
    "items",
    "sources",
    "matches",
    "search_results",
  ]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object") {
      continue;
    }
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);

    if (Array.isArray(current)) {
      for (const item of current) {
        queue.push(item);
      }
      continue;
    }

    for (const [key, child] of Object.entries(current)) {
      if (resultKeys.has(key.toLowerCase()) && Array.isArray(child)) {
        resultArrays.push(child);
      }
      if (child && typeof child === "object") {
        queue.push(child);
      }
    }
  }

  const rows = resultArrays
    .flat()
    .map((item) => {
      const record = asRecord(item);
      if (!record) {
        return null;
      }
      const url =
        toHumanValue(record.url) ??
        toHumanValue(record.link) ??
        toHumanValue(record.href);
      const title =
        toHumanValue(record.title) ??
        toHumanValue(record.name) ??
        toHumanValue(record.label);
      if (!(url || title)) {
        return null;
      }
      return { title: title ?? null, url: url ?? null };
    })
    .filter((row): row is { title: string | null; url: string | null } =>
      Boolean(row)
    );

  if (rows.length > 0) {
    return rows;
  }

  const action = asRecord(asRecord(output)?.action);
  const fallbackUrl =
    toHumanValue(action?.url) ?? findFirstStringDeep(output, ["url", "link"]);
  const fallbackTitle =
    toHumanValue(action?.title) ??
    findFirstStringDeep(output, ["title", "name"]);
  if (fallbackUrl || fallbackTitle) {
    return [{ title: fallbackTitle, url: fallbackUrl }];
  }
  return [];
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_KEY_RE = /(^|_)(id|uuid|guid|account_id|user_id|tenant_id)$/i;

/** Keys that are usually the interesting mutation payload (not identity). */
const MUTATION_VALUE_KEYS = [
  "backfill_days",
  "backfillDays",
  "days",
  "limit",
  "status",
  "theme",
  "locale",
  "enabled",
  "sync_enabled",
  "name",
  "title",
  "email",
  "query",
  "q",
  "path",
  "value",
] as const;

function unwrapToolPayload(output: unknown): Record<string, unknown> | null {
  const coerced = coerceToolOutput(output);
  const record = asRecord(coerced);
  if (!record) {
    return null;
  }
  const data = asRecord(record.data);
  return data ?? record;
}

function readCount(record: Record<string, unknown> | null): number | null {
  if (!record) {
    return null;
  }
  for (const key of ["total", "count", "totalCount", "total_count", "n"]) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return value;
    }
  }
  for (const key of [
    "results",
    "items",
    "data",
    "accounts",
    "rows",
    "matches",
    "records",
  ]) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.length;
    }
  }
  return null;
}

function nounForScope(scope: string | null | undefined, count: number): string {
  const base = (scope ?? "result").trim().toLowerCase() || "result";
  // Crude plural: accounts stays accounts; account → accounts.
  if (count === 1) {
    if (base.endsWith("s") && !base.endsWith("ss")) {
      return base.slice(0, -1) || base;
    }
    return base;
  }
  if (base.endsWith("s")) {
    return base;
  }
  return `${base}s`;
}

function looksLikeOpaqueId(value: string): boolean {
  const trimmed = value.trim();
  if (UUID_RE.test(trimmed)) {
    return true;
  }
  // ULID / long hex ids
  if (/^[0-9a-f]{20,}$/i.test(trimmed)) {
    return true;
  }
  return false;
}

function isNoiseArgKey(key: string): boolean {
  return ID_KEY_RE.test(key) || key === "account" || key === "id";
}

export function basenamePath(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  const segments = normalized.split("/").filter(Boolean);
  return segments.at(-1) ?? path;
}

/** `path/to/file.json (224634 bytes)` → `file.json`. */
export function readFileDumpBasename(output: unknown): string | null {
  const coerced = coerceToolOutput(output);
  if (typeof coerced !== "string" || !looksLikeNumberedFileDump(coerced)) {
    return null;
  }
  const header = coerced.trim().split("\n")[0] ?? "";
  const path = header.replace(/\(\s*\d+\s*bytes\s*\)\s*$/, "").trim();
  return path ? basenamePath(path) : null;
}

/**
 * `Read <basename>` for a workspace file read — the informative alternative to
 * dumping 224 KB of file content into the timeline.
 */
export function summarizeFileReadBrief(input: {
  input?: Record<string, unknown> | null;
  output?: unknown;
  toolName?: string;
}): string | null {
  const fromDump = readFileDumpBasename(input.output);
  if (fromDump) {
    return `Read ${fromDump}`;
  }
  const toolName = (input.toolName ?? "").toLowerCase();
  if (!toolName.includes("read")) {
    return null;
  }
  const path = input.input?.path;
  return typeof path === "string" && path.trim()
    ? `Read ${basenamePath(path.trim())}`
    : null;
}

/**
 * Brief one-liner for a tool step: list counts, search queries, or the
 * meaningful create/update fields — never raw UUID dumps.
 */
export function summarizeToolStepBrief(input: {
  input?: unknown;
  /** Scope / module label already shown on the right (e.g. "accounts"). */
  metadata?: string | null;
  output?: unknown;
  toolName?: string;
}): string | null {
  const payload = unwrapToolPayload(input.output);
  const count = readCount(payload);
  const inputRecord = asRecord(input.input);
  // engenty_tool_execute wraps the real catalog id — use it for verb detection.
  const executeId =
    input.toolName === "engenty_tool_execute" ||
    input.toolName === "invoke_frontend_tool"
      ? typeof inputRecord?.id === "string"
        ? inputRecord.id
        : typeof inputRecord?.tool_name === "string"
          ? inputRecord.tool_name
          : typeof inputRecord?.name === "string"
            ? inputRecord.name
            : null
      : null;
  const toolName = (executeId ?? input.toolName ?? "").toLowerCase();
  const meta = input.metadata?.trim() || null;

  // A file read has no count and no entity name, so without this it falls all
  // the way through to "no brief" and the step reads as a bare "Ran tool".
  const readBrief = summarizeFileReadBrief({
    input: inputRecord,
    output: input.output,
    toolName,
  });
  if (readBrief) {
    return readBrief;
  }

  const looksLikeList =
    /\b(list|search|find|query|get_many|index)\b/.test(toolName) ||
    toolName.includes("list_") ||
    toolName.endsWith("_list") ||
    toolName.includes("search");
  const looksLikeCreate =
    /\b(create|add|insert|new)\b/.test(toolName) || toolName.includes("create");
  const hasResultCollection = Boolean(
    payload &&
      ["results", "items", "matches", "accounts", "rows", "records"].some(
        (key) => Array.isArray(payload[key])
      )
  );

  if (count != null && (looksLikeList || hasResultCollection)) {
    const noun = nounForScope(meta, count);
    return `${count} ${noun}`;
  }

  // Top-level array output (rare but valid list shape).
  const coerced = coerceToolOutput(input.output);
  if (
    Array.isArray(coerced) &&
    (looksLikeList || coerced.length >= 0) &&
    (looksLikeList || coerced.length > 0)
  ) {
    const noun = nounForScope(meta, coerced.length);
    return `${coerced.length} ${noun}`;
  }

  const nestedInput =
    asRecord(inputRecord?.input) ??
    asRecord(inputRecord?.data) ??
    asRecord(inputRecord?.values) ??
    asRecord(inputRecord?.patch) ??
    inputRecord;

  // Created entity: bare name/title (not "name: …").
  if (looksLikeCreate || !looksLikeList) {
    const createdName =
      findFirstStringDeep(payload, ["name", "title", "email", "label"]) ??
      (nestedInput
        ? findFirstStringDeep(nestedInput, ["name", "title", "email", "label"])
        : null);
    if (
      createdName &&
      !looksLikeOpaqueId(createdName) &&
      (looksLikeCreate ||
        Boolean(
          payload &&
            (typeof payload.name === "string" ||
              typeof payload.title === "string")
        ))
    ) {
      return createdName.length > 48
        ? `${createdName.slice(0, 47)}…`
        : createdName;
    }
  }

  if (nestedInput) {
    const parts: string[] = [];
    for (const key of MUTATION_VALUE_KEYS) {
      if (!(key in nestedInput)) {
        continue;
      }
      if (isNoiseArgKey(key)) {
        continue;
      }
      // Query args belong in the label for search tools — skip here.
      if (looksLikeList && (key === "query" || key === "q")) {
        continue;
      }
      const raw = nestedInput[key];
      if (raw === null || raw === undefined) {
        continue;
      }
      if (
        typeof raw !== "string" &&
        typeof raw !== "number" &&
        typeof raw !== "boolean"
      ) {
        continue;
      }
      const display = String(raw).trim();
      if (!display || looksLikeOpaqueId(display)) {
        continue;
      }
      parts.push(`${key}: ${display}`);
      if (parts.length >= 2) {
        break;
      }
    }
    if (parts.length > 0) {
      return parts.join(" · ");
    }
  }

  if (count != null) {
    const noun = nounForScope(meta, count);
    return `${count} ${noun}`;
  }

  return null;
}
