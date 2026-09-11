/**
 * CUSTOM AG-UI event: the SYSTEM + CONTEXT snapshot for a run.
 *
 * Emitted once after the agent is assembled. The Trajectory projector folds it
 * into the SYSTEM / CONTEXT / HISTORY ledger rows. Recalled thread *bodies*
 * stay on `thread_message` (different retention). Pointers + a short preview
 * are small enough to snapshot here so a later compaction still shows what
 * this turn actually recalled.
 */
export const ENGENTY_DEBUG_INITIAL_PROMPT_EVENT =
  "engenty.debug.initial_prompt";

/** First N characters stored on a recalled-message pointer. */
export const RECALLED_MESSAGE_PREVIEW_CHARS = 100;

export interface RecalledMessagePointer {
  /**
   * Human speaker on a `role: "user"` message (`thread_message.author_user_id`).
   * `null` = unattended / synthetic (cron, task, another agent). Omitted on
   * snapshots written before this field existed — readers keep the LLM role.
   */
  authorUserId?: string | null;
  /** Serialized size of the whole recalled message, parts included. */
  chars: number;
  id: string | null;
  /** First {@link RECALLED_MESSAGE_PREVIEW_CHARS} characters, whitespace-collapsed. */
  preview: string;
  role: string;
}

/**
 * Ledger chip for a recalled row. LLM `user` is not "a person typed this" —
 * only a persisted author id is.
 */
export function historySpeakerKey(message: RecalledMessagePointer): string {
  if (message.role !== "user") {
    return message.role;
  }
  if (message.authorUserId) {
    return "human";
  }
  if (message.authorUserId === null) {
    return "agent";
  }
  return "user";
}

export interface EngentyDebugInitialPromptPayload {
  /** Recalled history — legacy payloads only; new emitters omit this. */
  modelMessages?: unknown;
  /**
   * Pointers to the messages `memory.recall()` returned for this turn — ids,
   * roles, sizes, and a short preview. Not the bodies.
   */
  recalledMessages?: RecalledMessagePointer[];
  runtimeContextInstructions: string;
  systemInstructions: string;
  toolNames: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readToolNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (entry): entry is string => typeof entry === "string" && entry.trim() !== ""
  );
}

function readRecalledMessages(value: unknown): RecalledMessagePointer[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: RecalledMessagePointer[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }
    const preview = readString(entry.preview).replace(/\s+/g, " ").trim();
    const role = readString(entry.role).trim() || "unknown";
    const chars =
      typeof entry.chars === "number" && Number.isFinite(entry.chars)
        ? Math.max(0, Math.round(entry.chars))
        : 0;
    const id =
      typeof entry.id === "string" && entry.id.trim() ? entry.id : null;
    if (!(id || preview || chars > 0)) {
      continue;
    }
    const authorRaw =
      entry.authorUserId === undefined
        ? entry.author_user_id
        : entry.authorUserId;
    let authorUserId: string | null | undefined;
    if (authorRaw === undefined) {
      authorUserId = undefined;
    } else if (typeof authorRaw === "string" && authorRaw.trim()) {
      authorUserId = authorRaw.trim();
    } else {
      authorUserId = null;
    }
    out.push({
      chars,
      id,
      preview,
      role,
      ...(authorUserId === undefined ? {} : { authorUserId }),
    });
  }
  return out;
}

export function readEngentyDebugInitialPrompt(
  value: unknown
): EngentyDebugInitialPromptPayload | null {
  if (!isRecord(value)) {
    return null;
  }
  const systemInstructions = readString(value.systemInstructions).trim();
  const runtimeContextInstructions = readString(
    value.runtimeContextInstructions
  ).trim();
  const toolNames = readToolNames(value.toolNames);
  const recalledMessages = readRecalledMessages(value.recalledMessages);
  const hasLegacyMessages = value.modelMessages !== undefined;
  if (
    !(
      systemInstructions ||
      runtimeContextInstructions ||
      toolNames.length > 0 ||
      recalledMessages.length > 0 ||
      hasLegacyMessages
    )
  ) {
    return null;
  }
  return {
    runtimeContextInstructions,
    systemInstructions,
    toolNames,
    ...(recalledMessages.length > 0 ? { recalledMessages } : {}),
    ...(hasLegacyMessages ? { modelMessages: value.modelMessages } : {}),
  };
}

export function readEngentyDebugInitialPromptEventValue(event: {
  name?: unknown;
  type?: unknown;
  value?: unknown;
}): EngentyDebugInitialPromptPayload | null {
  if (event.type !== "CUSTOM") {
    return null;
  }
  if (event.name !== ENGENTY_DEBUG_INITIAL_PROMPT_EVENT) {
    return null;
  }
  return readEngentyDebugInitialPrompt(event.value);
}
