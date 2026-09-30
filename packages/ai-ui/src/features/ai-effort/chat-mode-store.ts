// Per-thread composer picks the server does not know yet. A person's pick for
// a thread is a draft until the next fresh run on that thread resolves —
// the server then writes the thread's `chat_mode`, which is the truth. A chat
// not created yet keeps its draft in memory under its host until the thread
// exists, then the draft moves to the thread's id.
//
// Plain module state, shared by every lane on the page: the composer control
// reads it, `/effort` and the Extra offer write it, the session hook moves and
// settles it. No admin HTTP here — the session hook sits in the embed entry.

import {
  type ChatModePick,
  DEFAULT_CHAT_MODE_PICK,
  parseChatModePick,
} from "./chat-mode.js";

const DRAFTS_STORAGE_KEY = "engenty.chat-mode.drafts";
const LAST_CUSTOM_STORAGE_KEY = "engenty.chat-mode.custom";
/** Threads remembered in storage; the oldest draft goes first. */
const MAX_STORED_DRAFTS = 50;
const NEW_THREAD_PREFIX = "new:";

export interface ChatModeDraft {
  pick: ChatModePick;
  /**
   * When a run on the thread finished after this pick was made. The draft
   * yields to the thread's metadata once that has been read again after this.
   */
  settledAt: number | null;
}

let drafts: Map<string, ChatModeDraft> | null = null;
let lastCustom: Pick<ChatModePick, "customModel" | "customReasoning"> | null =
  null;
let extraTakesReasoning: boolean | undefined;
let version = 0;
const listeners = new Set<() => void>();

function storage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readJson(key: string): unknown {
  try {
    const raw = storage()?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    storage()?.setItem(key, JSON.stringify(value));
  } catch {
    // Remembering a pick is a nicety; losing it must not throw mid-send.
  }
}

function loadDrafts(): Map<string, ChatModeDraft> {
  if (drafts) {
    return drafts;
  }
  drafts = new Map();
  const stored = readJson(DRAFTS_STORAGE_KEY);
  if (Array.isArray(stored)) {
    for (const row of stored) {
      if (!Array.isArray(row) || typeof row[0] !== "string") {
        continue;
      }
      const record = row[1] as { pick?: unknown; settledAt?: unknown } | null;
      const pick = parseChatModePick(record?.pick);
      if (pick) {
        drafts.set(row[0], {
          pick,
          settledAt:
            typeof record?.settledAt === "number" ? record.settledAt : null,
        });
      }
    }
  }
  return drafts;
}

function persistDrafts(map: Map<string, ChatModeDraft>): void {
  const rows = [...map.entries()].filter(
    ([key]) => !key.startsWith(NEW_THREAD_PREFIX)
  );
  writeJson(DRAFTS_STORAGE_KEY, rows.slice(-MAX_STORED_DRAFTS));
  // Keep memory bounded the same way storage is.
  while (rows.length > MAX_STORED_DRAFTS) {
    const oldest = rows.shift();
    if (oldest) {
      map.delete(oldest[0]);
    }
  }
}

function emit(): void {
  version += 1;
  for (const listener of listeners) {
    listener();
  }
}

/** The draft key for a lane: its thread, or its not-yet-created chat. */
export function chatModeDraftKey(
  hostKey: string,
  threadId: string | null
): string {
  return threadId ?? `${NEW_THREAD_PREFIX}${hostKey}`;
}

export function subscribeChatModeStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Changes whenever a draft does — the `useSyncExternalStore` snapshot. */
export function chatModeStoreVersion(): number {
  return version;
}

export function readChatModeDraft(key: string): ChatModeDraft | undefined {
  return loadDrafts().get(key);
}

/**
 * The pick a thread starts from when nothing says otherwise: Normal, with the
 * Custom model last picked anywhere still checked in the flyout.
 */
export function baseChatModePick(): ChatModePick {
  if (lastCustom === null) {
    const stored = parseChatModePick({
      ...(readJson(LAST_CUSTOM_STORAGE_KEY) as object | null),
      mode: "normal",
    });
    lastCustom = {
      customModel: stored?.customModel ?? null,
      customReasoning: stored?.customReasoning ?? null,
    };
  }
  return { ...DEFAULT_CHAT_MODE_PICK, ...lastCustom };
}

/** The person's pick for a thread (or a new chat) — composer, `/effort`, the offer. */
export function setChatModeDraft(key: string, pick: ChatModePick): void {
  const map = loadDrafts();
  // Re-insert so the map's order stays "least recently picked first".
  map.delete(key);
  map.set(key, { pick, settledAt: null });
  if (pick.customModel) {
    lastCustom = {
      customModel: pick.customModel,
      customReasoning: pick.customReasoning,
    };
    writeJson(LAST_CUSTOM_STORAGE_KEY, lastCustom);
  }
  persistDrafts(map);
  emit();
}

/** A new chat just got its thread: its draft is now that thread's. */
export function moveChatModeDraft(fromKey: string, threadId: string): void {
  const map = loadDrafts();
  const draft = map.get(fromKey);
  if (!draft || fromKey === threadId) {
    return;
  }
  map.delete(fromKey);
  map.set(threadId, draft);
  persistDrafts(map);
  emit();
}

/**
 * A fresh run on the thread finished: the server has recorded its mode, so
 * the draft steps back once the thread's metadata is read again.
 */
export function settleChatModeDraft(threadId: string): void {
  const map = loadDrafts();
  const draft = map.get(threadId);
  if (!draft || draft.settledAt !== null) {
    return;
  }
  map.set(threadId, { ...draft, settledAt: Date.now() });
  persistDrafts(map);
  emit();
}

/** Forget a draft the thread's metadata has superseded. */
export function dropChatModeDraft(key: string): void {
  const map = loadDrafts();
  if (map.delete(key)) {
    persistDrafts(map);
    emit();
  }
}

/**
 * Whether the platform's Extra model takes a reasoning level. Written by the
 * composer once its options load; read where a turn is sent without the
 * composer (the Extra offer's resend). Undefined = not known yet.
 */
export function setExtraTakesReasoning(value: boolean | undefined): void {
  extraTakesReasoning = value;
}

export function readExtraTakesReasoning(): boolean | undefined {
  return extraTakesReasoning;
}
