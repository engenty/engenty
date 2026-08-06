// MESSAGES_SNAPSHOT projection: DB rows → AG-UI messages for transcript reload.
// Row order from listMessagesOrdered is canonical; we reorder only when an early
// HITL interrupt left the user turn after the assistant row in created_at order.

import type { AGUIEvent, RunAgentInput } from "@engenty/ag-ui-bridge";
import { buildAgUiMessagesFromSessionMessages } from "@engenty/ai-core";
import type { ThreadMessageRow } from "../../dal/threads/index.js";

type Message = RunAgentInput["messages"][number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function extractTextFromSessionParts(parts: unknown): string {
  if (!Array.isArray(parts)) {
    return "";
  }
  return parts
    .flatMap((part) =>
      isRecord(part) && part.type === "text" && typeof part.text === "string"
        ? [part.text]
        : []
    )
    .join("\n")
    .trim();
}

function findLastAssistantRowIndex(rows: readonly ThreadMessageRow[]): number {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (rows[index]?.role === "assistant") {
      return index;
    }
  }
  return -1;
}

function findSubmittedUserRowIndex(
  rows: readonly ThreadMessageRow[],
  submittedUserText: string | null | undefined
): number {
  const trimmed = submittedUserText?.trim();
  if (!trimmed) {
    return rows.findIndex((row) => row.role === "user");
  }
  return rows.findIndex(
    (row) =>
      row.role === "user" && extractTextFromSessionParts(row.parts) === trimmed
  );
}

/** Place the current user turn before the assistant row when DB timestamps invert order. */
export function orderRowsForTranscriptSnapshot(params: {
  rows: readonly ThreadMessageRow[];
  submittedUserParts?: readonly unknown[] | null;
  submittedUserText?: string | null;
  tenantId: string;
  threadId: string;
}): ThreadMessageRow[] {
  const ordered = [...params.rows];
  const submittedText = params.submittedUserText?.trim() ?? null;
  let userIndex = findSubmittedUserRowIndex(ordered, submittedText);

  if (userIndex < 0 && submittedText && params.submittedUserParts?.length) {
    ordered.push({
      author_user_id: null,
      created_at: new Date().toISOString(),
      id: `snapshot-user-${submittedText.slice(0, 32)}`,
      parts: params.submittedUserParts,
      role: "user",
      tenant_id: params.tenantId,
      thread_id: params.threadId,
    });
    userIndex = ordered.length - 1;
  }

  const assistantIndex = findLastAssistantRowIndex(ordered);
  if (userIndex >= 0 && assistantIndex >= 0 && userIndex > assistantIndex) {
    const [userRow] = ordered.splice(userIndex, 1);
    if (userRow) {
      ordered.splice(assistantIndex, 0, userRow);
    }
  }

  return ordered;
}

export function buildSessionMessagesSnapshotFromRows(params: {
  resourceId: string;
  rows: readonly ThreadMessageRow[];
  submittedUserParts?: readonly unknown[] | null;
  submittedUserText?: string | null;
  threadId: string;
}): Message[] {
  const orderedRows = orderRowsForTranscriptSnapshot({
    rows: params.rows,
    submittedUserParts: params.submittedUserParts,
    submittedUserText: params.submittedUserText,
    tenantId: params.rows[0]?.tenant_id ?? "",
    threadId: params.threadId,
  });
  return buildAgUiMessagesFromSessionMessages(
    orderedRows.map((row) => ({
      author_user_id: row.author_user_id,
      created_at: row.created_at,
      id: row.id,
      parts: row.parts,
      role: row.role,
    })),
    { preserveInputOrder: true }
  );
}

export function emitSessionMessagesSnapshot(params: {
  emit?: (event: AGUIEvent) => void;
  resourceId: string;
  rows: readonly ThreadMessageRow[];
  submittedUserParts?: readonly unknown[] | null;
  submittedUserText?: string | null;
  threadId: string;
}): void {
  params.emit?.({
    type: "MESSAGES_SNAPSHOT",
    messages: buildSessionMessagesSnapshotFromRows({
      resourceId: params.resourceId,
      rows: params.rows,
      submittedUserParts: params.submittedUserParts,
      submittedUserText: params.submittedUserText,
      threadId: params.threadId,
    }),
  });
}

/** Merge in-flight assistant transcript parts into snapshot rows (DB or synthetic). */
export function mergeAssistantTranscriptPartsForSnapshot(params: {
  messageId: string;
  rows: readonly ThreadMessageRow[];
  tenantId: string;
  threadId: string;
  transcriptParts: readonly unknown[];
}): ThreadMessageRow[] {
  if (params.transcriptParts.length === 0) {
    return [...params.rows];
  }
  const rows = [...params.rows];
  const targetIndex = rows.findIndex(
    (row) =>
      row.id === params.messageId ||
      (row.role === "assistant" && row.id === params.messageId)
  );
  const lastAssistantIndex = findLastAssistantRowIndex(rows);
  const resolvedIndex =
    targetIndex >= 0
      ? targetIndex
      : lastAssistantIndex >= 0
        ? lastAssistantIndex
        : -1;
  if (resolvedIndex >= 0 && rows[resolvedIndex]?.role === "assistant") {
    rows[resolvedIndex] = {
      ...rows[resolvedIndex]!,
      parts: params.transcriptParts,
    };
    return rows;
  }
  // Mastra Memory may not have flushed the assistant row yet (early HITL interrupt).
  rows.push({
    author_user_id: null,
    created_at: new Date().toISOString(),
    id: params.messageId,
    parts: params.transcriptParts,
    role: "assistant",
    tenant_id: params.tenantId,
    thread_id: params.threadId,
  });
  return rows;
}

export async function syncAssistantTranscriptPartsBeforeSnapshot(params: {
  messageId: string;
  rows: readonly ThreadMessageRow[];
  scope: { tenantId: string };
  store: {
    appendMessage?: (input: {
      authorUserId?: string | null;
      parts: unknown;
      role: ThreadMessageRow["role"];
      tenantId: string;
      threadId: string;
    }) => Promise<{ message: ThreadMessageRow }>;
    listMessagesOrdered: (input: {
      tenantId: string;
      threadId: string;
    }) => Promise<ThreadMessageRow[]>;
    updateMessageParts: (input: {
      messageId: string;
      parts: unknown;
      tenantId: string;
      threadId: string;
    }) => Promise<{ message: ThreadMessageRow }>;
  };
  threadId: string;
  transcriptParts: readonly unknown[];
}): Promise<ThreadMessageRow[]> {
  if (params.transcriptParts.length === 0) {
    return [...params.rows];
  }
  const mergedRows = mergeAssistantTranscriptPartsForSnapshot({
    messageId: params.messageId,
    rows: params.rows,
    tenantId: params.scope.tenantId,
    threadId: params.threadId,
    transcriptParts: params.transcriptParts,
  });
  const targetRow =
    mergedRows.find((row) => row.id === params.messageId) ??
    mergedRows.findLast((row) => row.role === "assistant");
  if (targetRow?.role !== "assistant") {
    return mergedRows;
  }
  const persistedAssistant = params.rows.find(
    (row) => row.role === "assistant" && row.id === targetRow.id
  );
  if (persistedAssistant) {
    await params.store.updateMessageParts({
      messageId: targetRow.id,
      parts: params.transcriptParts,
      tenantId: params.scope.tenantId,
      threadId: params.threadId,
    });
    return params.store.listMessagesOrdered({
      tenantId: params.scope.tenantId,
      threadId: params.threadId,
    });
  }
  if (params.store.appendMessage) {
    await params.store.appendMessage({
      authorUserId: null,
      parts: params.transcriptParts,
      role: "assistant",
      tenantId: params.scope.tenantId,
      threadId: params.threadId,
    });
    return params.store.listMessagesOrdered({
      tenantId: params.scope.tenantId,
      threadId: params.threadId,
    });
  }
  return mergedRows;
}
