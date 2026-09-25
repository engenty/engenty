// Chat-surface user bubbles: speech, not toasts. Consecutive turns from the
// same speaker sit close with square corners where they meet.

import { parseAgentMessageHeader } from "@engenty/ai-core/browser";
import { readUiGuideFollowUp } from "@engenty/app-shell";
import { cn } from "@engenty/ui-core";

export interface ChatBubbleCluster {
  meetsAbove: boolean;
  meetsBelow: boolean;
}

const LONG_INLINE_TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isLongInlineToken(text: string): boolean {
  const value = text.trim();
  if (value.length >= 24) {
    return true;
  }
  if (LONG_INLINE_TOKEN_RE.test(value)) {
    return true;
  }
  return value.includes("/") && value.split("/").filter(Boolean).length >= 2;
}

/**
 * Display-only: a click in a Copilot guide reaches the model as
 * `[ui_guide] guide_id=… action=next label="Weiter"`; the person sees the
 * button they pressed, and what they typed into the guide's fields.
 */
export function humanizeUiGuideFollowUp(
  text: string,
  t: (key: string, values: Record<string, string>) => string
): string {
  const followUp = readUiGuideFollowUp(text);
  if (!followUp) {
    return text;
  }
  const action = `**${followUp.label ?? followUp.action_id.replaceAll("_", " ")}**`;
  const lines = [
    followUp.title
      ? t("uiGuideFollowUp.withTitle", { action, title: followUp.title })
      : t("uiGuideFollowUp.plain", { action }),
  ];
  for (const { key, value } of followUp.inputs) {
    lines.push(key === "input" ? value : `${key}: ${value}`);
  }
  return lines.join("\n\n");
}

/** Display-only: long IDs and paths stay type, not chips. */
export function softenUserInlineCode(text: string): string {
  return text.replace(/`([^`]+)`/g, (full, inner: string) =>
    isLongInlineToken(inner) ? inner : full
  );
}

function firstTextPart(parts: readonly unknown[] | undefined): string {
  for (const part of parts ?? []) {
    if (!part || typeof part !== "object") {
      continue;
    }
    const record = part as { text?: unknown; type?: unknown };
    if (record.type === "text" && typeof record.text === "string") {
      return record.text;
    }
  }
  return "";
}

/**
 * Same-speaker key for clustering bubbles. Assistant bubbles cluster by the
 * agent that wrote them (a room has several); without an author they never
 * join. System never joins.
 */
export function chatSpeakerKey(msg: {
  authorName?: string | null;
  /** Whose copilot wrote this, when the author is someone's alter ego. */
  alterEgoUserName?: string | null;
  id?: string;
  parts?: readonly unknown[];
  role: string;
}): string {
  if (msg.role === "assistant" && msg.authorName) {
    return `assistant:${msg.authorName}`;
  }
  if (msg.role !== "user") {
    return `${msg.role}:${msg.id ?? ""}`;
  }
  const header = parseAgentMessageHeader(firstTextPart(msg.parts));
  if (header) {
    return `agent:${header.senderId}`;
  }
  if (msg.authorName) {
    return `user:${msg.authorName}`;
  }
  return "user";
}

export function chatBubbleCluster(
  keys: readonly string[],
  barriers: ReadonlySet<number> = new Set()
): ChatBubbleCluster[] {
  return keys.map((key, index) => {
    const prev = keys[index - 1];
    const next = keys[index + 1];
    return {
      meetsAbove: prev === key && !barriers.has(index),
      meetsBelow: next === key && !barriers.has(index + 1),
    };
  });
}

const INLINE_CODE_CLASSNAME =
  "[&_[data-streamdown=inline-code]]:rounded-sm [&_[data-streamdown=inline-code]]:border-0 [&_[data-streamdown=inline-code]]:bg-primary/15! [&_[data-streamdown=inline-code]]:px-1 [&_[data-streamdown=inline-code]]:py-px [&_[data-streamdown=inline-code]]:font-mono [&_[data-streamdown=inline-code]]:text-[0.8125rem] [&_[data-streamdown=inline-code]]:shadow-none";

export function chatUserBubbleClassName(cluster: ChatBubbleCluster): string {
  const radius = cluster.meetsAbove
    ? cluster.meetsBelow
      ? "rounded-none!"
      : "rounded-t-none! rounded-b-2xl!"
    : cluster.meetsBelow
      ? "rounded-t-2xl! rounded-b-none!"
      : "rounded-2xl!";

  return cn(
    "max-w-[min(100%,28rem)] border-0! bg-primary/10! px-3! py-2! shadow-none",
    INLINE_CODE_CLASSNAME,
    radius
  );
}

/**
 * What a row of the transcript is, for spacing: a `bubble` of words, a
 * `line` of clips (an agent's actions with no words of their own), or a
 * `divider` (date, memory break).
 */
export type ChatRowKind = "bubble" | "divider" | "line";

/**
 * The one spacing rule of a chat transcript: the gap above a row follows
 * from it and the row before — the pieces themselves carry no outer margin.
 * A new speaker or a divider opens with 16px; within one speaker, bubbles
 * that touch sit 2px apart and a line of clips sits as close to its
 * neighbours as clips sit to the words inside a turn (8px, plus the
 * clip block's own padding).
 */
export function chatRowGapClassName(
  previous: ChatRowKind | null,
  current: ChatRowKind,
  relation: { joined: boolean; sameSpeaker: boolean }
): string | null {
  if (previous === null) {
    return null;
  }
  if (
    previous === "divider" ||
    current === "divider" ||
    !relation.sameSpeaker
  ) {
    return "mt-4";
  }
  if (previous === "line" || current === "line") {
    return "mt-2";
  }
  return relation.joined ? "mt-0.5" : "mt-4";
}
