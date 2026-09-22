// Cutting a chapter into the river.
//
// A chapter is a stretch of the person's one copilot conversation, summarised
// once and kept (dal/threads/types.ts `ThreadCompactionRow`). Three ways to
// cut one — a calendar day, a calendar week, or "everything since the last
// one" on request — share this one generator: read the turns of the stretch,
// group them by the space each was said in (turn-context.ts), ask a model for
// the title, the summary and what to keep in mind, keep the row.
//
// A stretch with no turn of the person's is not a chapter; nothing is written
// and no model is asked. A weekly chapter reads the week's daily chapters
// where they exist, so a week costs one call over seven summaries rather than
// one over seven days of transcript.

import { DEFAULT_AI_CLASSIFIER_MODEL_ID } from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import { generateText } from "ai";
import { z } from "zod";
import type { ThreadStore } from "../../dal/threads/index.js";
import type {
  ThreadCompactionKind,
  ThreadCompactionRow,
  ThreadCompactionSpace,
  ThreadMessageRow,
} from "../../dal/threads/types.js";
import {
  MESSAGE_CONTEXT_KEY,
  type TurnContext,
} from "../conversation/turn-context.js";
import { dueChapterRanges, formatChapterRange } from "./chapter-ranges.js";

const logger = createLogger({ name: "apps/ai/river-chapters" });

/** Roughly a long working day of conversation; beyond it the middle is cut. */
const MAX_TRANSCRIPT_CHARS = 48_000;
const MAX_TITLE_CHARS = 80;
const MAX_SUMMARY_CHARS = 1600;
const MAX_NOTES = 6;

const chapterOutputSchema = z.object({
  keep_in_mind: z
    .array(
      z.object({
        space_key: z.string().nullable().optional(),
        text: z.string().min(1).max(300),
      })
    )
    .max(MAX_NOTES)
    .default([]),
  summary: z.string().min(1).max(MAX_SUMMARY_CHARS),
  title: z.string().min(1).max(MAX_TITLE_CHARS),
});

const INSTRUCTIONS = [
  "You write the chapter summary of a long-running private conversation between a person and their AI copilot.",
  "You are given the conversation's turns for one stretch of time, each turn marked with the space (workspace area) the person was in when they said it.",
  'Answer with ONE JSON object and nothing else: {"title": string, "summary": string, "keep_in_mind": [{"text": string, "space_key": string|null}]}.',
  "Rules:",
  `- title: what this stretch was about, at most ${MAX_TITLE_CHARS} characters, no date, no quotes.`,
  `- summary: what was discussed and decided, per space where that matters, 2 to 8 sentences, at most ${MAX_SUMMARY_CHARS} characters. Name records, people and numbers that came up; skip pleasantries.`,
  `- keep_in_mind: at most ${MAX_NOTES} items worth remembering after this stretch — open questions, decisions, things to follow up — each with the space_key it belongs to, or null when it is general. Empty when there is nothing.`,
  "- Same language as the conversation.",
].join("\n");

function textOfParts(parts: unknown): string {
  if (!Array.isArray(parts)) {
    return "";
  }
  const texts: string[] = [];
  for (const part of parts) {
    if (
      part &&
      typeof part === "object" &&
      (part as { type?: unknown }).type === "text" &&
      typeof (part as { text?: unknown }).text === "string"
    ) {
      texts.push((part as { text: string }).text);
    }
  }
  return texts.join("\n").trim();
}

function turnContextOf(message: ThreadMessageRow): TurnContext | null {
  const context = message.metadata?.[MESSAGE_CONTEXT_KEY];
  if (!(context && typeof context === "object")) {
    return null;
  }
  const record = context as Record<string, unknown>;
  const str = (value: unknown) => (typeof value === "string" ? value : null);
  return {
    module_id: str(record.module_id),
    pathname: str(record.pathname),
    route_key: str(record.route_key),
    space_id: str(record.space_id),
  };
}

/** `/s/<key>/…` → key, decoded; null anywhere else. */
export function spaceKeyOfPathname(pathname: string | null): string | null {
  const match = pathname?.match(/^\/s\/([^/?#]+)/);
  if (!match?.[1]) {
    return null;
  }
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function clockOf(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

/**
 * The stretch as the model reads it — one line per turn, the person's turns
 * marked with where they stood — plus the spaces it touched.
 */
export function buildChapterTranscript(
  messages: readonly ThreadMessageRow[],
  timeZone: string
): { spaces: ThreadCompactionSpace[]; text: string; userTurns: number } {
  const lines: string[] = [];
  const spaces = new Map<string, ThreadCompactionSpace>();
  let userTurns = 0;
  let currentSpace: string | null = null;
  for (const message of messages) {
    const text = textOfParts(message.parts);
    if (!text) {
      continue;
    }
    if (message.role === "user") {
      userTurns += 1;
      const context = turnContextOf(message);
      const key = spaceKeyOfPathname(context?.pathname ?? null);
      if (context?.space_id) {
        spaces.set(context.space_id, { id: context.space_id, key });
      }
      currentSpace = key ?? (context?.space_id ? "?" : null);
      lines.push(
        `[${clockOf(message.created_at, timeZone)} · ${currentSpace ? `space ${currentSpace}` : "outside any space"}] Person: ${text}`
      );
    } else if (message.role === "assistant") {
      lines.push(`Copilot: ${text}`);
    }
  }
  let text = lines.join("\n\n");
  if (text.length > MAX_TRANSCRIPT_CHARS) {
    const half = Math.floor(MAX_TRANSCRIPT_CHARS / 2);
    text = `${text.slice(0, half)}\n\n[… ${text.length - MAX_TRANSCRIPT_CHARS} characters left out …]\n\n${text.slice(-half)}`;
  }
  return { spaces: [...spaces.values()], text, userTurns };
}

function parseChapterOutput(raw: string) {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) {
    return null;
  }
  try {
    return chapterOutputSchema.parse(JSON.parse(raw.slice(start, end + 1)));
  } catch {
    return null;
  }
}

export interface CompactRiverInput {
  end: Date;
  kind: ThreadCompactionKind;
  /** AI Gateway model id; the memory model where the caller resolved one. */
  modelId?: string | null;
  start: Date;
  store: ThreadStore;
  tenantId: string;
  threadId: string;
  timeZone: string;
  userId: string;
}

/**
 * Cut one chapter over [start, end). Null when the stretch holds no turn of
 * the person's — an empty day is not a chapter — or when the model gave
 * nothing usable, in which case nothing is kept and the stretch stays open.
 */
export async function compactRiver(
  input: CompactRiverInput
): Promise<ThreadCompactionRow | null> {
  const { store, tenantId, threadId } = input;
  let source: {
    spaces: ThreadCompactionSpace[];
    text: string;
    userTurns: number;
  };
  let messageCount = 0;
  if (input.kind === "weekly") {
    // The week's daily chapters, where they exist; the raw turns otherwise.
    const dailies = (await store.listCompactions({ tenantId, threadId }))
      .filter(
        (row) =>
          row.kind === "daily" &&
          new Date(row.range_start).getTime() >= input.start.getTime() &&
          new Date(row.range_end).getTime() <= input.end.getTime()
      )
      .toSorted((a, b) => a.range_start.localeCompare(b.range_start));
    if (dailies.length > 0) {
      const spaces = new Map<string, ThreadCompactionSpace>();
      for (const row of dailies) {
        for (const space of row.spaces) {
          spaces.set(space.id, space);
        }
      }
      source = {
        spaces: [...spaces.values()],
        text: dailies
          .map(
            (row) =>
              `## ${formatChapterRange({ end: new Date(row.range_end), kind: "daily", start: new Date(row.range_start), timeZone: input.timeZone })} — ${row.title}\n${row.summary}${row.keep_in_mind.length ? `\nKeep in mind: ${row.keep_in_mind.map((note) => note.text).join("; ")}` : ""}`
          )
          .join("\n\n"),
        userTurns: dailies.length,
      };
      messageCount = dailies.reduce((sum, row) => sum + row.message_count, 0);
    } else {
      const messages = await store.listMessagesOrdered({
        after: input.start,
        before: input.end,
        beforeExclusive: true,
        limit: false,
        tenantId,
        threadId,
      });
      source = buildChapterTranscript(messages, input.timeZone);
      messageCount = messages.length;
    }
  } else {
    const messages = await store.listMessagesOrdered({
      after: input.start,
      before: input.end,
      beforeExclusive: true,
      limit: false,
      tenantId,
      threadId,
    });
    source = buildChapterTranscript(messages, input.timeZone);
    messageCount = messages.length;
  }
  if (source.userTurns === 0 || !source.text.trim()) {
    return null;
  }
  if (!process.env.AI_GATEWAY_API_KEY?.trim()) {
    logger.warn("river chapter skipped — no AI gateway key", { threadId });
    return null;
  }
  const model = input.modelId?.trim() || DEFAULT_AI_CLASSIFIER_MODEL_ID;
  let output: z.infer<typeof chapterOutputSchema> | null = null;
  try {
    const { text } = await generateText({
      instructions: INSTRUCTIONS,
      maxOutputTokens: 1200,
      model,
      prompt: [
        `Stretch: ${formatChapterRange({ end: input.end, kind: input.kind, start: input.start, timeZone: input.timeZone })}`,
        source.spaces.length > 0
          ? `Spaces: ${source.spaces.map((space) => space.key ?? space.id).join(", ")}`
          : "Spaces: none (outside any space)",
        "",
        source.text,
      ].join("\n"),
      temperature: 0.2,
    });
    output = parseChapterOutput(text);
  } catch (error) {
    logger.warn("river chapter generation failed", {
      error: error instanceof Error ? error.message : String(error),
      kind: input.kind,
      model,
      threadId,
    });
    return null;
  }
  if (!output) {
    logger.warn("river chapter output unusable", {
      kind: input.kind,
      threadId,
    });
    return null;
  }
  return await store.insertCompaction({
    keep_in_mind: output.keep_in_mind.map((note) => ({
      space_key: note.space_key ?? null,
      text: note.text.trim(),
    })),
    kind: input.kind,
    message_count: messageCount,
    range_end: input.end.toISOString(),
    range_start: input.start.toISOString(),
    spaces: source.spaces,
    summary: output.summary.trim(),
    tenant_id: tenantId,
    thread_id: threadId,
    title: output.title.trim().replace(/^["']|["']$/g, ""),
    user_id: input.userId,
  });
}

/**
 * Cut every daily and weekly chapter that is due for this river — called
 * when the chapters are read, so a river that nobody opens costs nothing and
 * one that is opened is current. Returns what was cut.
 */
export async function ensureScheduledChapters(input: {
  modelId?: string | null;
  now?: Date;
  riverCreatedAt: string;
  store: ThreadStore;
  tenantId: string;
  threadId: string;
  timeZone: string;
  userId: string;
}): Promise<ThreadCompactionRow[]> {
  const { store, tenantId, threadId } = input;
  const [dailyEnd, weeklyEnd] = await Promise.all([
    store.latestCompactionEnd({ kinds: ["daily"], tenantId, threadId }),
    store.latestCompactionEnd({ kinds: ["weekly"], tenantId, threadId }),
  ]);
  const begin = new Date(input.riverCreatedAt);
  const ranges = dueChapterRanges({
    dailyFrom: dailyEnd ? new Date(dailyEnd) : begin,
    now: input.now ?? new Date(),
    timeZone: input.timeZone,
    weeklyFrom: weeklyEnd ? new Date(weeklyEnd) : begin,
  });
  const cut: ThreadCompactionRow[] = [];
  // Dailies first, oldest first, so a weekly cut in the same pass can read them.
  for (const range of ranges.toSorted((a, b) =>
    a.kind === b.kind
      ? a.start.getTime() - b.start.getTime()
      : a.kind === "daily"
        ? -1
        : 1
  )) {
    const row = await compactRiver({
      end: range.end,
      kind: range.kind,
      modelId: input.modelId,
      start: range.start,
      store,
      tenantId,
      threadId,
      timeZone: input.timeZone,
      userId: input.userId,
    });
    if (row) {
      cut.push(row);
    }
  }
  return cut;
}

/** Cut a chapter on request: everything since the last daily or manual one. */
export async function compactRiverNow(input: {
  modelId?: string | null;
  now?: Date;
  riverCreatedAt: string;
  store: ThreadStore;
  tenantId: string;
  threadId: string;
  timeZone: string;
  userId: string;
}): Promise<ThreadCompactionRow | null> {
  const latest = await input.store.latestCompactionEnd({
    kinds: ["daily", "manual"],
    tenantId: input.tenantId,
    threadId: input.threadId,
  });
  return await compactRiver({
    end: input.now ?? new Date(),
    kind: "manual",
    modelId: input.modelId,
    start: new Date(latest ?? input.riverCreatedAt),
    store: input.store,
    tenantId: input.tenantId,
    threadId: input.threadId,
    timeZone: input.timeZone,
    userId: input.userId,
  });
}
