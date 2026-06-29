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

export function detectToolOutputError(output: unknown): string | null {
  const direct = zodIssueMessages(output);
  if (direct) {
    return direct;
  }
  const record = asRecord(output);
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

export function extractProseSnippet(output: unknown): string | null {
  if (typeof output === "string") {
    const trimmed = output.trim();
    return trimmed && /\s/.test(trimmed) ? trimmed : null;
  }
  const record = asRecord(output);
  if (!record) {
    return null;
  }
  for (const key of PROSE_OUTPUT_KEYS) {
    const value = record[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed && /\s/.test(trimmed)) {
        return trimmed;
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
