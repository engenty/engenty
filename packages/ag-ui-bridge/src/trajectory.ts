import type { AGUIEvent } from "@ag-ui/core";
import {
  type EngentyDebugInitialPromptPayload,
  historySpeakerKey,
  readEngentyDebugInitialPromptEventValue,
} from "./engenty-debug-initial-prompt.js";

/**
 * One ledger row — the same projection DeepSeek Harness Trajectory uses:
 * SYSTEM / USER / CONTEXT / ASSISTANT / TOOL, not the per-token AG-UI wire.
 */
export type TrajectoryCellKind =
  | "assistant"
  | "context"
  | "history"
  | "system"
  | "tool"
  | "user";

export interface TrajectoryRow {
  detail: string;
  id: string;
  /**
   * Role or tool name called out in the ledger (HISTORY `human` / `agent` /
   * `user` / `signal`, TOOL `web_search`). Null when the kind chip is already
   * that name.
   */
  keyLabel: string | null;
  kind: TrajectoryCellKind;
  result: string | null;
  resultDetail: string | null;
  /**
   * AG-UI / recalled message id. Used to jump from a ghost history row to the
   * live turn that produced it.
   */
  sourceMessageId: string | null;
  text: string;
  turn: number | null;
  turnStart: boolean;
}

/** Minimal speech fallback when the wire stream has no USER/ASSISTANT text. */
export interface TrajectorySpeechMessage {
  content?: unknown;
  id?: string | null;
  role?: string;
}

export interface RunEventRecordLike {
  event_type: string;
  payload: Record<string, unknown>;
}

interface DraftRow {
  detail: string;
  id: string;
  keyLabel?: string | null;
  kind: TrajectoryCellKind;
  result: string | null;
  resultDetail: string | null;
  sourceMessageId?: string | null;
  text: string;
}

interface OpenTool {
  args: string;
  name: string;
  row: DraftRow;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readDelta(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function oneLine(value: string, max = 96): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) {
    return "";
  }
  return compact.length <= max ? compact : `${compact.slice(0, max - 1)}…`;
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return String(value);
  }
}

function compactJson(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  try {
    return JSON.stringify(JSON.parse(trimmed));
  } catch {
    return oneLine(trimmed, 160);
  }
}

function messagePreview(message: TrajectorySpeechMessage): string {
  if (typeof message.content === "string") {
    return message.content.trim();
  }
  if (Array.isArray(message.content)) {
    return message.content
      .flatMap((part) =>
        isRecord(part) && typeof part.text === "string" ? [part.text] : []
      )
      .join(" ")
      .trim();
  }
  return "";
}

function syncToolRow(tool: OpenTool) {
  const compact = compactJson(tool.args);
  tool.row.text = compact ? `${tool.name} ${compact}` : tool.name;
  tool.row.detail = compact
    ? `${tool.name}\n${compact}`
    : tool.args.trim()
      ? `${tool.name}\n${tool.args}`
      : tool.name;
}

function assignTurns(rows: readonly DraftRow[]): TrajectoryRow[] {
  let turn = 0;
  let labelled = 0;
  return rows.map((row) => {
    const preamble =
      row.kind === "system" || row.kind === "context" || row.kind === "history";
    if (row.kind === "user") {
      turn += 1;
    } else if (!preamble && turn === 0) {
      // Headless / routine fires have no USER row — the first TOOL or
      // ASSISTANT is still turn 1, or the header reads "Turns 0".
      turn = 1;
    }
    const turnStart =
      !preamble && row.kind !== "user" && turn > 0 && labelled !== turn;
    if (turnStart) {
      labelled = turn;
    }
    return {
      ...row,
      keyLabel: row.keyLabel?.trim() || null,
      sourceMessageId: row.sourceMessageId?.trim() || null,
      turn: preamble ? null : turn || null,
      turnStart,
    };
  });
}

/** Text with the highlighted key stripped so the chip is not repeated. */
export function trajectoryRowKeyPreview(row: {
  keyLabel: string | null;
  text: string;
}): string {
  const key = row.keyLabel?.trim();
  if (!key) {
    return row.text;
  }
  if (row.text === key) {
    return "";
  }
  if (row.text.startsWith(`${key} `) || row.text.startsWith(`${key}\t`)) {
    return row.text.slice(key.length).replace(/^\s+/, "");
  }
  return row.text;
}

/** Collapsed SYSTEM label when the run stored tool names but no instructions. */
export const SYSTEM_INSTRUCTIONS_NOT_CAPTURED =
  "System instructions were not captured";

function systemInstructionsText(
  prompt: EngentyDebugInitialPromptPayload
): string {
  if (prompt.systemInstructions.trim()) {
    return prompt.systemInstructions;
  }
  if (prompt.modelMessages !== undefined) {
    return formatJson(prompt.modelMessages);
  }
  return "";
}

function systemDetail(prompt: EngentyDebugInitialPromptPayload): string {
  const parts: string[] = [];
  const instructions = systemInstructionsText(prompt);
  if (instructions) {
    parts.push(instructions);
  }
  if (prompt.toolNames.length > 0) {
    parts.push(
      `── tools (${prompt.toolNames.length}) ──\n${prompt.toolNames.join(", ")}`
    );
  }
  return parts.filter((part) => part.trim()).join("\n\n");
}

function systemPreview(prompt: EngentyDebugInitialPromptPayload): string {
  const instructions = systemInstructionsText(prompt);
  if (instructions) {
    return oneLine(instructions, 88);
  }
  if (prompt.toolNames.length > 0) {
    return `${SYSTEM_INSTRUCTIONS_NOT_CAPTURED} · ${prompt.toolNames.length} tools`;
  }
  return "Initial System Prompt";
}

function pointerIdShort(id: string | null): string {
  if (!id) {
    return "—";
  }
  return id.length > 13 ? `${id.slice(0, 8)}…` : id;
}

function historyRowText(
  message: NonNullable<
    EngentyDebugInitialPromptPayload["recalledMessages"]
  >[number]
): string {
  const preview = message.preview.trim();
  const head = `${historySpeakerKey(message)}  ${pointerIdShort(message.id)}  ${message.chars}c`;
  return preview ? `${head}  ${preview}` : head;
}

function historyRowDetail(
  message: NonNullable<
    EngentyDebugInitialPromptPayload["recalledMessages"]
  >[number]
): string {
  const speaker = historySpeakerKey(message);
  const lines = [`id  ${message.id ?? "—"}`, `${message.chars} chars`];
  if (speaker !== message.role) {
    lines.push(`speaker  ${speaker}`);
  }
  if (message.authorUserId) {
    lines.push(`author  ${message.authorUserId}`);
  }
  const preview = message.preview.trim();
  if (preview) {
    lines.push("", preview);
  }
  return lines.join("\n");
}

function findInitialPrompt(
  events: readonly AGUIEvent[]
): EngentyDebugInitialPromptPayload | null {
  for (const event of [...events].reverse()) {
    const prompt = readEngentyDebugInitialPromptEventValue(
      event as { name?: unknown; type?: unknown; value?: unknown }
    );
    if (prompt) {
      return prompt;
    }
  }
  return null;
}

function fallbackToolRows(
  events: readonly AGUIEvent[],
  nextId: NextId
): DraftRow[] {
  const calls = new Map<string, OpenTool>();
  const body: DraftRow[] = [];
  for (const event of events) {
    const record = event as Record<string, unknown>;
    const id = readString(record.toolCallId);
    if (!id) {
      continue;
    }
    const type = String(record.type);
    if (type === "TOOL_CALL_START") {
      const name = readString(record.toolCallName) ?? "tool";
      const row: DraftRow = {
        detail: name,
        id: nextId("tool", id),
        kind: "tool",
        keyLabel: name,
        result: null,
        resultDetail: null,
        text: name,
      };
      const tool = { args: "", name, row };
      calls.set(id, tool);
      body.push(row);
      continue;
    }
    const tool = calls.get(id);
    if (!tool) {
      continue;
    }
    if (type === "TOOL_CALL_ARGS") {
      tool.args += readDelta(record.delta);
      syncToolRow(tool);
    } else if (type === "TOOL_CALL_RESULT") {
      const content = readDelta(record.content) || readString(record.value);
      if (content) {
        tool.row.resultDetail = content;
        tool.row.result = oneLine(content, 72);
      }
    }
  }
  return body;
}

type NextId = (kind: string, key: string) => string;

/**
 * Fold the AG-UI wire stream into a Trajectory-style ledger: one row per
 * user turn, assembled assistant/reasoning span, or tool call — oldest first.
 */
export function buildInspectorTrajectory(
  events: readonly AGUIEvent[],
  messages: readonly TrajectorySpeechMessage[] = []
): TrajectoryRow[] {
  const body: DraftRow[] = [];
  const tools = new Map<string, OpenTool>();
  let openRole: "assistant" | "user" | null = null;
  let openMessageId: string | null = null;
  let textBuf = "";
  let reasoningBuf = "";
  let rowSeq = 0;

  const nextId: NextId = (kind, key) => {
    rowSeq += 1;
    return `${kind}-${rowSeq}-${key}`;
  };

  const flushText = () => {
    const content = textBuf;
    const reasoning = reasoningBuf;
    const messageId = openMessageId;
    textBuf = "";
    reasoningBuf = "";
    openMessageId = null;
    const contentTrim = content.trim();
    const reasoningTrim = reasoning.trim();
    if (openRole === "user") {
      openRole = null;
      if (contentTrim) {
        body.push({
          detail: contentTrim,
          id: nextId("user", "text"),
          kind: "user",
          result: null,
          resultDetail: null,
          sourceMessageId: messageId,
          text: contentTrim,
        });
      }
      return;
    }
    openRole = null;
    const visible = contentTrim || reasoningTrim;
    if (!visible) {
      return;
    }
    const detail =
      contentTrim && reasoningTrim
        ? `── thinking ──\n${reasoningTrim}\n\n── text ──\n${contentTrim}`
        : visible;
    body.push({
      detail,
      id: nextId("assistant", "text"),
      kind: "assistant",
      result: null,
      resultDetail: null,
      sourceMessageId: messageId,
      text: visible,
    });
  };

  for (const event of events) {
    const record = event as Record<string, unknown>;
    const type = String(record.type);

    if (type === "TEXT_MESSAGE_START") {
      const role = record.role === "user" ? "user" : "assistant";
      if (role === "user" || openRole === "user" || textBuf.trim()) {
        flushText();
      }
      openRole = role;
      openMessageId = readString(record.messageId);
      continue;
    }
    if (type === "TEXT_MESSAGE_CONTENT") {
      textBuf += readDelta(record.delta);
      continue;
    }
    if (type === "TEXT_MESSAGE_END") {
      flushText();
      continue;
    }
    if (type === "REASONING_MESSAGE_CONTENT") {
      reasoningBuf += readDelta(record.delta);
      continue;
    }
    if (type === "TOOL_CALL_START") {
      flushText();
      const id = readString(record.toolCallId);
      if (!id) {
        continue;
      }
      const name = readString(record.toolCallName) ?? "tool";
      const row: DraftRow = {
        detail: name,
        id: nextId("tool", id),
        kind: "tool",
        keyLabel: name,
        result: null,
        resultDetail: null,
        text: name,
      };
      tools.set(id, { args: "", name, row });
      body.push(row);
      continue;
    }
    if (type === "TOOL_CALL_ARGS") {
      const id = readString(record.toolCallId);
      const tool = id ? tools.get(id) : undefined;
      if (tool) {
        tool.args += readDelta(record.delta);
        syncToolRow(tool);
      }
      continue;
    }
    if (type === "TOOL_CALL_RESULT") {
      const id = readString(record.toolCallId);
      const tool = id ? tools.get(id) : undefined;
      const content = readDelta(record.content) || readString(record.value);
      if (tool && content) {
        tool.row.resultDetail = content;
        tool.row.result = oneLine(content, 72);
      }
    }
  }
  flushText();

  if (!body.some((row) => row.kind === "user" || row.kind === "assistant")) {
    for (const message of messages) {
      const kind =
        message.role === "user"
          ? "user"
          : message.role === "assistant"
            ? "assistant"
            : null;
      if (!kind) {
        continue;
      }
      const text = messagePreview(message);
      if (!text) {
        continue;
      }
      body.push({
        detail: text,
        id: nextId(kind, message.id || "message"),
        kind,
        result: null,
        resultDetail: null,
        sourceMessageId: message.id ?? null,
        text,
      });
    }
  }

  if (!body.some((row) => row.kind === "tool")) {
    body.push(...fallbackToolRows(events, nextId));
  }

  const prompt = findInitialPrompt(events);
  const out: DraftRow[] = [];
  if (prompt) {
    const detail = systemDetail(prompt);
    if (detail.trim()) {
      out.push({
        detail,
        id: "system-initial",
        kind: "system",
        result: null,
        resultDetail: null,
        text: systemPreview(prompt),
      });
    }
    const recalled = prompt.recalledMessages ?? [];
    for (const [index, message] of recalled.entries()) {
      out.push({
        detail: historyRowDetail(message),
        id: `history-${index}-${message.id ?? "anon"}`,
        kind: "history",
        keyLabel: historySpeakerKey(message),
        result: null,
        resultDetail: null,
        sourceMessageId: message.id,
        text: historyRowText(message),
      });
    }
  }

  const contextRow: DraftRow | null = prompt?.runtimeContextInstructions
    ? {
        detail: prompt.runtimeContextInstructions,
        id: "context-runtime",
        kind: "context",
        result: null,
        resultDetail: null,
        text: oneLine(
          `Current runtime context  ${prompt.runtimeContextInstructions}`,
          96
        ),
      }
    : null;

  let contextInserted = false;
  for (const row of body) {
    out.push(row);
    if (row.kind === "user" && contextRow && !contextInserted) {
      out.push(contextRow);
      contextInserted = true;
    }
  }
  if (contextRow && !contextInserted) {
    out.push(contextRow);
  }

  return assignTurns(out);
}

export function trajectoryTranscript(rows: readonly TrajectoryRow[]): string {
  return rows
    .map((row) => {
      const turn = row.turnStart && row.turn ? `Turn ${row.turn}` : "";
      const result = row.result ? ` → ${row.result}` : "";
      return [turn, row.kind.toUpperCase(), `${row.text}${result}`]
        .filter(Boolean)
        .join("  ");
    })
    .join("\n");
}

/** Durable `ai.agent_run_event` rows → the AG-UI events the projector folds. */
export function runEventRecordsToAgUi(
  events: readonly RunEventRecordLike[]
): AGUIEvent[] {
  return events.map((event) => {
    const payload = event.payload ?? {};
    if (typeof payload.type === "string") {
      return payload as AGUIEvent;
    }
    return { ...payload, type: event.event_type } as AGUIEvent;
  });
}
