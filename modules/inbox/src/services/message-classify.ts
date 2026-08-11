// Cheap category-only classification, so the list can be filtered by lane
// without having opened (and digested) every thread first. Header + snippet is
// enough signal for spam/newsletter/promotion; the full digest refines the
// category later and writes it back.
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";
import {
  buildCategoryGuide,
  categorySlugs,
  defaultInboxCategories,
  INBOX_MESSAGE_CATEGORIES,
  type InboxCategoryItem,
} from "../schema/categories.js";
import type { InboxMessage, InboxMessageCategory } from "../schema/types.js";

/** One model call classifies a whole batch — categories are cheap. */
const BATCH_SIZE = 20;
const SNIPPET_CHARS = 400;

function describe(message: InboxMessage, index: number): string {
  return [
    `${index}:`,
    `  From: ${message.from_name ?? ""} <${message.from_email ?? ""}>`,
    `  Subject: ${message.subject ?? "(none)"}`,
    `  Preview: ${(message.snippet ?? "").slice(0, SNIPPET_CHARS)}`,
  ].join("\n");
}

function allowlistFrom(
  categories: readonly InboxCategoryItem[]
): readonly string[] {
  const slugs = categorySlugs(categories);
  return slugs.length > 0 ? slugs : INBOX_MESSAGE_CATEGORIES;
}

function isAllowedCategory(
  value: unknown,
  allowlist: readonly string[]
): value is InboxMessageCategory {
  return typeof value === "string" && allowlist.includes(value);
}

function fallbackCategory(allowlist: readonly string[]): InboxMessageCategory {
  return allowlist.includes("conversation")
    ? "conversation"
    : (allowlist[0] ?? "conversation");
}

/**
 * Coerce whatever shape a small model returns into an index→category map.
 * Accepts the bare map, `{ categories: map }`, `{ categories: [{index,category}] }`,
 * and `{ categories: ["newsletter", ...] }` (array order = index).
 */
export function coerceCategoryMap(
  raw: unknown,
  allowlist: readonly string[] = INBOX_MESSAGE_CATEGORIES
): Record<string, InboxMessageCategory> | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const obj = raw as Record<string, unknown>;

  const fromEntries = (
    entries: Iterable<[string, unknown]>
  ): Record<string, InboxMessageCategory> | null => {
    const out: Record<string, InboxMessageCategory> = {};
    let any = false;
    for (const [key, value] of entries) {
      if (!(/^\d+$/.test(key) && isAllowedCategory(value, allowlist))) {
        continue;
      }
      out[key] = value;
      any = true;
    }
    return any ? out : null;
  };

  const direct = fromEntries(Object.entries(obj));
  if (direct) {
    return direct;
  }

  const nested = obj.categories;
  if (Array.isArray(nested)) {
    const out: Record<string, InboxMessageCategory> = {};
    let any = false;
    for (let index = 0; index < nested.length; index++) {
      const entry = nested[index];
      if (isAllowedCategory(entry, allowlist)) {
        out[String(index)] = entry;
        any = true;
        continue;
      }
      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        const row = entry as { category?: unknown; index?: unknown };
        const idx =
          typeof row.index === "number" && Number.isInteger(row.index)
            ? row.index
            : index;
        if (isAllowedCategory(row.category, allowlist)) {
          out[String(idx)] = row.category;
          any = true;
        }
      }
    }
    return any ? out : null;
  }
  if (nested && typeof nested === "object") {
    return fromEntries(Object.entries(nested as Record<string, unknown>));
  }
  return null;
}

/** Apply a model categories map onto a batch; missing indices → conversation. */
export function applyCategoryMap(
  batch: InboxMessage[],
  categories: Record<string, InboxMessageCategory>,
  allowlist: readonly string[] = INBOX_MESSAGE_CATEGORIES
): Map<string, InboxMessageCategory> {
  const fallback = fallbackCategory(allowlist);
  const result = new Map<string, InboxMessageCategory>();
  for (let index = 0; index < batch.length; index++) {
    const message = batch[index];
    if (!message) {
      continue;
    }
    const raw = categories[String(index)];
    result.set(message.id, isAllowedCategory(raw, allowlist) ? raw : fallback);
  }
  return result;
}

async function classifyBatch(
  batch: InboxMessage[],
  modelId: string,
  categoryItems: readonly InboxCategoryItem[]
): Promise<Record<string, InboxMessageCategory>> {
  const allowlist = allowlistFrom(categoryItems);
  const guide = buildCategoryGuide(categoryItems);
  const batchOutputSchema = z.record(
    z.string(),
    z.string().refine((value) => allowlist.includes(value), {
      message: "unknown category",
    })
  );
  try {
    const { output } = await generateText({
      model: modelId,
      output: Output.object({ schema: batchOutputSchema }),
      prompt: [
        "Classify each email by what kind of mail it is.",
        guide,
        "",
        `Return a JSON object mapping each index to its category slug. Allowed: ${allowlist.join("|")}.`,
        'Example: { "0": "conversation", "1": "newsletter" }.',
        "Include every listed index exactly once.",
        "",
        batch.map((message, index) => describe(message, index)).join("\n\n"),
      ].join("\n"),
    });
    return output;
  } catch (error) {
    // Small models sometimes wrap or array-ify despite the schema. Recover
    // from the raw text when the structured parse rejected a usable payload.
    if (NoObjectGeneratedError.isInstance(error) && error.text) {
      try {
        const repaired = coerceCategoryMap(JSON.parse(error.text), allowlist);
        if (repaired) {
          return repaired;
        }
      } catch {
        // fall through
      }
    }
    throw error;
  }
}

/**
 * Classify messages by sender/subject/snippet. Returns one entry per input
 * message; anything the model skips falls back to `conversation` so a message
 * is never hidden from the default lanes by a classifier miss.
 */
export async function classifyInboxMessages(
  messages: InboxMessage[],
  modelId: string,
  categoryItems: readonly InboxCategoryItem[] = defaultInboxCategories().items
): Promise<Map<string, InboxMessageCategory>> {
  const result = new Map<string, InboxMessageCategory>();
  if (messages.length === 0) {
    return result;
  }
  const allowlist = allowlistFrom(categoryItems);

  for (let start = 0; start < messages.length; start += BATCH_SIZE) {
    const batch = messages.slice(start, start + BATCH_SIZE);
    const categories = await classifyBatch(batch, modelId, categoryItems);
    for (const [id, category] of applyCategoryMap(
      batch,
      categories,
      allowlist
    )) {
      result.set(id, category);
    }
  }
  return result;
}
