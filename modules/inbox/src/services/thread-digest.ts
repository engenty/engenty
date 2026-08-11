// Optimized thread view: strip each message down to its substance with a light
// model, triage attachments (real documents vs. signature/social decoration),
// and keep a thread-level "current status" summary. Results are cached in
// module_inbox.message_digests / thread_digests keyed by INBOX_DIGEST_VERSION;
// bump the version whenever the prompts change materially.
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";
import type { InboxRepo } from "../dal/contracts.js";
import {
  splitQuotedEmailHtml,
  splitQuotedPlainText,
} from "../lib/email-reply-split.js";
import {
  buildCategoryGuide,
  categorySlugs,
  defaultInboxCategories,
  INBOX_MESSAGE_CATEGORIES,
  type InboxCategoryItem,
} from "../schema/categories.js";
import type {
  InboxAttachmentMeta,
  InboxMessage,
  InboxMessageCategory,
  InboxMessageDigest,
  InboxThread,
  InboxThreadDigest,
  InboxThreadDigestResult,
} from "../schema/types.js";

/** @deprecated Prefer buildCategoryGuide(items) — default fixed-catalog prompt. */
export const CATEGORY_GUIDE = buildCategoryGuide(
  defaultInboxCategories().items
);

export const INBOX_DIGEST_VERSION = 7;

const MAX_BODY_CHARS = 12_000;
const MAX_DIGEST_CHARS = 20_000;
/** Inline/tiny images below this size are decoration unless the model objects. */
const DECORATION_IMAGE_MAX_BYTES = 32 * 1024;

/**
 * Deterministic pre-triage: obvious decoration never reaches the model.
 *
 * Signature logos, social icons and tracking pixels are small images the client
 * embedded inline (they carry a `content_id`); real pasted screenshots are
 * inline too but an order of magnitude larger — in observed mail 2–23 KB vs.
 * 55–250 KB. Matching the `cid:` reference in the body is not reliable (Gmail
 * rewrites ids), so inline + small is the rule.
 */
export function isLikelyDecorationAttachment(
  attachment: InboxAttachmentMeta
): boolean {
  const isImage = attachment.mime_type?.startsWith("image/") ?? false;
  if (!isImage) {
    return false;
  }
  const size = attachment.size ?? null;
  const small = size === null || size <= DECORATION_IMAGE_MAX_BYTES;
  if (attachment.content_id && small) {
    return true;
  }
  if (small) {
    const generatedName = /^(image\d*|logo\d*|icon\d*|banner\d*)\.\w+$/i;
    const name = attachment.filename?.trim() ?? "";
    if (!name || generatedName.test(name)) {
      return true;
    }
  }
  return false;
}

/**
 * Latest (non-quoted) part of the body, as Markdown for the prompt. Structure
 * matters: the model is asked to preserve headings and lists, so it has to see
 * them in the first place.
 */
export function extractLatestBodyText(message: InboxMessage): string {
  if (message.body_html) {
    const { latest } = splitQuotedEmailHtml(message.body_html);
    return htmlToPromptMarkdown(latest).slice(0, MAX_BODY_CHARS);
  }
  if (message.body_text) {
    const { latest } = splitQuotedPlainText(message.body_text);
    return latest.slice(0, MAX_BODY_CHARS);
  }
  return "";
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&");
}

/** Cheap HTML → Markdown: headings, emphasis, lists, quotes, code and links survive. */
export function htmlToPromptMarkdown(html: string): string {
  const markdown = html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(
      /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
      (_match, href: string, label: string) => {
        const text = decodeEntities(label.replace(/<[^>]+>/g, "")).trim();
        // Bare URLs as link text would render as "[url](url)" — keep them bare.
        return !text || text === href ? ` ${href} ` : ` [${text}](${href}) `;
      }
    )
    .replace(
      /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi,
      (_match, level: string, inner: string) =>
        `\n\n${"#".repeat(Number(level))} ${inner.replace(/<[^>]+>/g, " ").trim()}\n\n`
    )
    .replace(
      /<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi,
      (_match, inner: string) => {
        const text = inner.replace(/<[^>]+>/g, " ").trim();
        return text ? `**${text}**` : "";
      }
    )
    .replace(
      /<(?:em|i)\b[^>]*>([\s\S]*?)<\/(?:em|i)>/gi,
      (_match, inner: string) => {
        const text = inner.replace(/<[^>]+>/g, " ").trim();
        return text ? `*${text}*` : "";
      }
    )
    .replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_match, inner: string) => {
      const text = decodeEntities(inner.replace(/<[^>]+>/g, "")).trim();
      return text ? `\n\`\`\`\n${text}\n\`\`\`\n` : "";
    })
    .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_match, inner: string) => {
      const text = decodeEntities(inner.replace(/<[^>]+>/g, "")).trim();
      return text ? `\`${text}\`` : "";
    })
    .replace(
      /<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi,
      (_match, inner: string) => {
        const text = inner
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        return text
          ? `\n\n${text
              .split(/\n+/)
              .map((line) => `> ${line.trim()}`)
              .join("\n")}\n\n`
          : "";
      }
    )
    // Numbered lists before bare <li> so Outlook's <ol><li><p>…</p></li> keeps order.
    .replace(/<ol\b[^>]*>([\s\S]*?)<\/ol>/gi, (_match, inner: string) => {
      let index = 0;
      const items = inner.replace(
        /<li\b[^>]*>([\s\S]*?)<\/li>/gi,
        (_li: string, item: string) => {
          index += 1;
          const text = item
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          return text ? `\n${index}. ${text}` : "";
        }
      );
      return `\n${items}\n`;
    })
    // Paired, so block tags nested inside a list item (Outlook wraps every
    // item in a <p>) cannot split the bullet from its own text.
    .replace(
      /<li\b[^>]*>([\s\S]*?)<\/li>/gi,
      (_match, inner: string) =>
        `\n- ${inner
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()}`
    )
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/li>/gi, "")
    .replace(/<(?:br)\b[^>]*>/gi, "\n")
    .replace(/<\/(?:p|div|tr|ul|ol|table)>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ");

  return normalizeDigestMarkdown(
    decodeEntities(markdown)
      .replace(/[ \t]+/g, " ")
      .replace(/ ?\n ?/g, "\n")
  );
}

/**
 * A bullet whose text landed on the next line renders as an empty marker with
 * an orphaned paragraph. Applied to both the model's input and its output —
 * the model tends to mirror whatever structure it was handed.
 */
export function normalizeDigestMarkdown(markdown: string): string {
  return markdown
    .replace(/^([ \t]*[-*])[ \t]*\n+(?=[ \t]*\S)/gm, "$1 ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Built with the plain `zod` instance — the operation schemas use
// `@hono/zod-openapi`'s, and mixing the two breaks the AI SDK's JSON-Schema
// conversion. Category is a free string constrained by the tenant allowlist
// at coerce / refine time (not a fixed enum).
function messageDigestStrictSchemaFor(allowlist: readonly string[]) {
  const fallback = allowlist.includes("conversation")
    ? "conversation"
    : (allowlist[0] ?? "conversation");
  return z.object({
    category: z
      .string()
      .refine((value) => allowlist.includes(value), {
        message: `category must be one of: ${allowlist.join("|")}`,
      })
      .describe(`What kind of mail this is — one of: ${allowlist.join("|")}.`)
      .catch(fallback),
    content_markdown: z
      .string()
      .describe(
        "The message body after light cleanup (mail chrome removed), as Markdown that preserves the writer's structure and formatting, in the original language."
      ),
    keep_attachment_indexes: z
      .array(z.number().int().min(0))
      .describe(
        "Indexes (from the provided list) of attachments a human would consider real content."
      ),
  });
}

export type MessageDigestModelOutput = z.infer<
  ReturnType<typeof messageDigestStrictSchemaFor>
>;

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
 * Small models often rename fields (`body` / `classification`) or drop the
 * attachment index list. Normalize those aliases before schema validation.
 */
export function coerceMessageDigestOutput(
  raw: unknown,
  allowlist: readonly string[] = INBOX_MESSAGE_CATEGORIES
): MessageDigestModelOutput | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const content =
    obj.content_markdown ??
    obj.content_md ??
    obj.body ??
    obj.content ??
    obj.markdown;
  if (typeof content !== "string") {
    return null;
  }
  const categoryRaw = obj.category ?? obj.classification ?? obj.ai_category;
  const keepRaw =
    obj.keep_attachment_indexes ??
    obj.keep_attachments ??
    obj.attachment_indexes;
  const keep_attachment_indexes = Array.isArray(keepRaw)
    ? keepRaw.filter(
        (index): index is number =>
          typeof index === "number" && Number.isInteger(index) && index >= 0
      )
    : [];
  return {
    category: isAllowedCategory(categoryRaw, allowlist)
      ? categoryRaw
      : fallbackCategory(allowlist),
    content_markdown: content,
    keep_attachment_indexes,
  };
}
const threadSummaryOutputSchema = z.object({
  participants: z.array(
    z.object({
      email: z.string(),
      name: z.string().nullable(),
      role: z
        .string()
        .nullable()
        .describe("Very short role hint, e.g. 'customer', 'reports the bugs'."),
    })
  ),
  headline: z
    .string()
    .describe(
      "One sentence: what the latest message asks of the reader or tells them. The thread's language."
    ),
  open_points: z
    .array(z.string())
    .describe(
      "Only what is still open right now, newest first. Empty when nothing is pending."
    ),
  suggested_actions: z
    .array(z.string())
    .min(2)
    .max(3)
    .describe(
      "2–3 short next actions the reader could take, phrased as instructions to an assistant."
    ),
});

function describeAttachments(attachments: InboxAttachmentMeta[]): string {
  if (attachments.length === 0) {
    return "(none)";
  }
  return attachments
    .map(
      (attachment, index) =>
        `${index}: ${attachment.filename ?? "(unnamed)"} — ${
          attachment.mime_type ?? "unknown type"
        }, ${attachment.size ?? "?"} bytes${
          attachment.content_id ? ", referenced inline (cid)" : ""
        }`
    )
    .join("\n");
}

export interface GeneratedMessageDigest {
  attachments: InboxAttachmentMeta[];
  category: InboxMessageCategory;
  content_md: string;
}

/** One light-model call: strip the body + confirm attachment triage. */
export async function generateMessageDigest(
  message: InboxMessage,
  modelId: string,
  categoryItems: readonly InboxCategoryItem[] = defaultInboxCategories().items
): Promise<GeneratedMessageDigest> {
  const body = extractLatestBodyText(message);
  const candidates = message.attachments_json.filter(
    (attachment) => !isLikelyDecorationAttachment(attachment)
  );
  const allowlist = categorySlugs(categoryItems);
  const fallback = fallbackCategory(
    allowlist.length > 0 ? allowlist : INBOX_MESSAGE_CATEGORIES
  );
  if (!body.trim() && candidates.length === 0) {
    return { attachments: [], category: fallback, content_md: "" };
  }
  const output = await runMessageDigestModel({
    body,
    candidates,
    categoryItems,
    message,
    modelId,
  });
  const keep = new Set(
    output.keep_attachment_indexes.filter(
      (index) => index >= 0 && index < candidates.length
    )
  );
  return {
    attachments: candidates.filter((_, index) => keep.has(index)),
    category: output.category,
    content_md: normalizeDigestMarkdown(output.content_markdown).slice(
      0,
      MAX_DIGEST_CHARS
    ),
  };
}

async function runMessageDigestModel(input: {
  body: string;
  candidates: InboxAttachmentMeta[];
  categoryItems: readonly InboxCategoryItem[];
  message: InboxMessage;
  modelId: string;
}): Promise<MessageDigestModelOutput> {
  const allowlist =
    categorySlugs(input.categoryItems).length > 0
      ? categorySlugs(input.categoryItems)
      : INBOX_MESSAGE_CATEGORIES;
  const guide = buildCategoryGuide(input.categoryItems);
  const strictSchema = messageDigestStrictSchemaFor(allowlist);
  const outputSchema = z.preprocess(
    (raw) => coerceMessageDigestOutput(raw, allowlist) ?? raw,
    strictSchema
  );
  const prompt = [
    "You prepare an email for a compact chat-style thread view.",
    "Clean the message lightly — remove mail chrome, keep the writer's content and formatting intact.",
    "",
    "What to REMOVE (mail chrome only):",
    '- Salutations and sign-offs ("Hi …,", "Best regards,", "Viele Grüße,", …).',
    "- Signature blocks, contact footers, legal disclaimers, unsubscribe / tracking footers.",
    "- Quoted earlier messages and reply chains (the body already excludes them when possible).",
    "",
    "What to KEEP (do not summarize, shorten, paraphrase, or rewrite):",
    "- Every substantive statement, question, request, date, name, number, and link.",
    "- The original language and tone.",
    "- Structure and formatting from the input Markdown:",
    "  · headings stay headings (`## …`)",
    "  · bullet / numbered lists stay lists (each item on the same line as its marker)",
    "  · bold / italics stay marked",
    "  · links stay `[text](url)` (or bare URLs)",
    "  · short paragraphs and line breaks that separate ideas — do NOT collapse the body into one dense paragraph",
    "  · topic labels the sender used to group points (e.g. `Magazin:`, `Archiv:`) become headings",
    "  · tables stay as Markdown tables when present",
    "",
    "Prefer fidelity over neatness. If unsure whether something is substance or chrome, keep it.",
    "",
    "Also pick which attachments are real content a human attached on purpose (documents, spreadsheets, real photos). Exclude signature logos, social-media icons, calendar/meeting boilerplate images, and decoration.",
    "",
    "Finally classify the message:",
    guide,
    "",
    "Return JSON with exactly these keys:",
    '- "content_markdown": string (cleaned body as Markdown — preserve formatting)',
    `- "category": one of ${allowlist.join("|")}`,
    '- "keep_attachment_indexes": number[] (indexes from the Attachments list; [] if none)',
    "",
    `From: ${input.message.from_name ?? ""} <${input.message.from_email ?? ""}>`,
    `Subject: ${input.message.subject ?? "(none)"}`,
    "",
    "Attachments:",
    describeAttachments(input.candidates),
    "",
    "Body:",
    "---",
    input.body || "(empty)",
    "---",
  ].join("\n");

  try {
    const { output } = await generateText({
      model: input.modelId,
      output: Output.object({ schema: outputSchema }),
      prompt,
    });
    return output;
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error) && error.text) {
      try {
        const repaired = coerceMessageDigestOutput(
          JSON.parse(error.text),
          allowlist
        );
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

export interface GeneratedThreadSummary {
  participants: InboxThreadDigest["participants_json"];
  suggested_actions: string[];
  summary_md: string;
}

/** Summarize the whole thread from the already-stripped message digests. */
export async function generateThreadSummary(
  thread: InboxThread,
  messages: InboxMessage[],
  digestByMessageId: Map<string, string>,
  modelId: string
): Promise<GeneratedThreadSummary> {
  const latest = messages.at(-1);
  const earlier = messages.slice(0, -1);
  const render = (message: InboxMessage) => {
    const content =
      digestByMessageId.get(message.id)?.trim() || message.snippet || "";
    const stamp = message.received_at ?? message.created_at;
    return `[${stamp}] ${message.from_name ?? message.from_email ?? "?"} <${
      message.from_email ?? ""
    }>:\n${content}`;
  };

  const { output } = await generateText({
    model: modelId,
    output: Output.object({ schema: threadSummaryOutputSchema }),
    prompt: [
      "You brief someone who just opened this email thread and wants to know where it stands RIGHT NOW.",
      "",
      "The latest message is what matters. Write:",
      "- headline: one sentence stating what the latest message asks of the reader, or what it tells them. Concrete and specific — name the actual thing, never 'various topics' or 'several issues'.",
      "- open_points: only what is still pending AS OF the latest message, newest first, at most 5 short entries. If an earlier request was answered, resolved, or superseded later in the thread, LEAVE IT OUT — a stale open point is worse than none. If nothing is pending, return an empty list.",
      "- suggested_actions: ALWAYS propose 2–3 next actions the reader could take, each a short instruction to an assistant (e.g. 'Draft a reply confirming Monday 10:00', 'Turn the open bugs into a task list'). Base them on the latest message. Even a thread that needs no reply has useful actions (summarize, extract dates, file it) — never return an empty list.",
      "",
      "Use the earlier messages only as context for understanding the latest one — do not recap the thread's history and do not list what is already done.",
      "Write in the thread's language. No filler, no preamble.",
      "",
      "Also map the participants: for each email address, the display name if known and a very short role hint inferred from the messages (e.g. 'customer', 'reports website bugs', 'cc'd colleague'). Only use the addresses provided.",
      "",
      `Subject: ${thread.subject ?? "(none)"}`,
      `Participant addresses: ${thread.participants.join(", ") || "(none)"}`,
      "",
      "Earlier messages (chronological, context only):",
      "---",
      earlier.map(render).join("\n\n").slice(0, 30_000) || "(none)",
      "---",
      "",
      "LATEST MESSAGE — this is what the briefing is about:",
      "---",
      latest ? render(latest).slice(0, 12_000) : "(empty)",
      "---",
    ].join("\n"),
  });
  const known = new Set(
    thread.participants.map((email) => email.toLowerCase())
  );
  const headline = output.headline.trim();
  const openPoints = output.open_points
    .map((point) => point.trim())
    .filter(Boolean);
  const summary = [
    headline,
    ...(openPoints.length > 0
      ? ["", ...openPoints.map((point) => `- ${point}`)]
      : []),
  ].join("\n");
  return {
    participants: output.participants
      .filter((participant) => known.has(participant.email.toLowerCase()))
      .map((participant) => ({
        email: participant.email.toLowerCase(),
        name: participant.name?.trim() || null,
        role: participant.role?.trim() || null,
      })),
    suggested_actions: output.suggested_actions
      .map((action) => action.trim())
      .filter(Boolean)
      .slice(0, 3),
    summary_md: normalizeDigestMarkdown(summary).slice(0, MAX_DIGEST_CHARS),
  };
}

/**
 * The thread's category. Once a human has written into a thread it is a
 * conversation, no matter how it started (a reply to a newsletter is a
 * conversation); otherwise the most frequent category wins.
 */
export function dominantCategory(
  categories: InboxMessageCategory[]
): InboxMessageCategory {
  if (categories.length === 0) {
    return "conversation";
  }
  if (categories.includes("conversation")) {
    return "conversation";
  }
  const counts = new Map<InboxMessageCategory, number>();
  for (const category of categories) {
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return [...counts.entries()].reduce((best, entry) =>
    entry[1] > best[1] ? entry : best
  )[0];
}

export interface EnsureThreadDigestOptions {
  /** Tenant category catalog (rules + allowlist). */
  categoryItems?: readonly InboxCategoryItem[];
  /**
   * Also produce the thread-level status summary. Reading a thread does not
   * need one — it is an extra model call per thread, so it stays opt-in and
   * the UI asks for it when the reader does.
   */
  includeSummary?: boolean;
  messages: InboxMessage[];
  /** Resolved classifier-tier model id (tenant → installation → env → default). */
  modelId: string;
  /** Regenerate everything, ignoring the cache. */
  refresh?: boolean;
  repo: InboxRepo;
  thread: InboxThread;
}

/**
 * Return the cached digest for a thread, generating whatever is missing or
 * stale (new messages since the last summary, version bump, explicit refresh).
 */
export async function ensureThreadDigest(
  options: EnsureThreadDigestOptions
): Promise<InboxThreadDigestResult> {
  const {
    includeSummary = false,
    messages,
    modelId,
    categoryItems = defaultInboxCategories().items,
    refresh = false,
    repo,
    thread,
  } = options;
  const ownerUserId = thread.owner_user_id;

  const cached = refresh
    ? []
    : await repo.digests.listMessageDigests(thread.id);
  const cachedById = new Map(
    cached
      .filter((digest) => digest.digest_version === INBOX_DIGEST_VERSION)
      .map((digest) => [digest.message_id, digest])
  );

  const results: InboxMessageDigest[] = [];
  await Promise.all(
    messages.map(async (message) => {
      const hit = cachedById.get(message.id);
      if (hit) {
        results.push(hit);
        return;
      }
      const generated = await generateMessageDigest(
        message,
        modelId,
        categoryItems
      );
      const stored = await repo.digests.upsertMessageDigest({
        attachments_json: generated.attachments,
        category: generated.category,
        content_md: generated.content_md,
        digest_version: INBOX_DIGEST_VERSION,
        message_id: message.id,
        model_id: modelId,
        owner_user_id: ownerUserId,
        thread_id: thread.id,
      });
      results.push(stored);
    })
  );
  const orderById = new Map(
    messages.map((message, index) => [message.id, index])
  );
  results.sort(
    (a, b) =>
      (orderById.get(a.message_id) ?? 0) - (orderById.get(b.message_id) ?? 0)
  );

  // The digest saw the full body, so its verdict beats whatever the cheap
  // header-only classifier wrote — push it back onto the message rows the
  // list lanes filter on.
  const refined = new Map(
    results
      .filter((digest) => {
        const message = messages.find(
          (candidate) => candidate.id === digest.message_id
        );
        return message && message.ai_category !== digest.category;
      })
      .map((digest) => [digest.message_id, digest.category])
  );
  if (refined.size > 0) {
    await repo.messages.setCategories(refined);
  }

  const threadCategory = dominantCategory(
    results.map((digest) => digest.category)
  );
  if (!includeSummary) {
    return { category: threadCategory, messages: results, thread: null };
  }

  const lastMessageId = messages.at(-1)?.id ?? null;
  let threadDigest = refresh
    ? null
    : await repo.digests.getThreadDigest(thread.id);
  const stale =
    !threadDigest ||
    threadDigest.digest_version !== INBOX_DIGEST_VERSION ||
    threadDigest.summarized_message_count !== messages.length ||
    threadDigest.last_message_id !== lastMessageId;
  if (stale) {
    const summary = await generateThreadSummary(
      thread,
      messages,
      new Map(results.map((digest) => [digest.message_id, digest.content_md])),
      modelId
    );
    threadDigest = await repo.digests.upsertThreadDigest({
      category: threadCategory,
      digest_version: INBOX_DIGEST_VERSION,
      last_message_id: lastMessageId,
      model_id: modelId,
      owner_user_id: ownerUserId,
      participants_json: summary.participants,
      suggested_actions: summary.suggested_actions,
      summarized_message_count: messages.length,
      summary_md: summary.summary_md,
      thread_id: thread.id,
    });
  }

  if (!threadDigest) {
    throw new Error("inbox digest: thread summary generation failed");
  }
  return { category: threadCategory, messages: results, thread: threadDigest };
}
