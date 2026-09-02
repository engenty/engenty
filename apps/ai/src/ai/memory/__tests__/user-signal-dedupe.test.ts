// A resume must not re-persist the user turn it is resuming.
//
// Mastra delivers user turns as SIGNAL messages, and the id of the signal
// message is not stable across runs: the start run persists the row under one
// id, and a snapshot resume — which rebuilds the turn from Mastra's own workflow
// state instead of from our rows — re-saves the same turn under another. Keyed
// only on `message.id`, the second save found nothing and inserted a duplicate,
// so the model re-read the user's question on every later turn and the chat
// showed it twice on reload. The signal id survives both paths.
import { describe, expect, it, vi } from "vitest";
import type { ThreadStore } from "../../../dal/threads/index.js";
import { createEngentySessionMemoryStorage } from "../engenty-session-memory-storage.js";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const THREAD_ID = "8be6011b-dbc8-459b-aee2-57471417a2e0";
const USER_ID = "cbc56539-47c7-4003-932d-c09d82b30ab2";
const SIGNAL_ID = "54e84f9e-ad13-4e90-afe8-9eca43b3ac0a";
const PERSISTED_ROW_ID = "d941a4b1-0a94-4b53-9b6f-b6aaaf1d891d";
const TEXT = "lass mich aus einer aus 4 farben mit dem decsion tool wählen";

/** A user turn as Mastra hands it to storage: role `signal`, id in metadata. */
function userSignalMessage(messageId: string) {
  return {
    content: {
      format: 2,
      metadata: {
        signal: {
          acceptedAt: "2026-08-09T12:46:23.507Z",
          createdAt: "2026-08-09T12:46:23.615Z",
          id: SIGNAL_ID,
          tagName: "user",
          type: "user",
        },
      },
      parts: [{ text: TEXT, type: "text" }],
    },
    createdAt: new Date("2026-08-09T12:46:23.615Z"),
    id: messageId,
    resourceId: USER_ID,
    role: "signal",
    threadId: THREAD_ID,
  };
}

function buildStorage(rows: unknown[]) {
  const appendMessage = vi.fn(
    async (args: { parts: unknown[]; role: string }) => ({
      message: {
        created_at: "2026-08-09T13:13:31.494Z",
        id: "generated",
        parts: args.parts,
        role: args.role,
      },
    })
  );
  const store = {
    appendMessage,
    getThread: async () => ({ agent_id: "engenty.copilot", id: THREAD_ID }),
    listMessagesOrdered: async () => rows,
    updateMessageParts: vi.fn(async () => ({ message: rows[0] })),
  } as unknown as ThreadStore;
  const storage = createEngentySessionMemoryStorage({
    agentId: "engenty.copilot",
    scope: { tenantId: TENANT_ID, userId: USER_ID },
    store,
  });
  return { appendMessage, storage };
}

/** The row the START run left behind: our generated id, signal id in metadata. */
const PERSISTED_USER_ROW = {
  created_at: "2026-08-09T12:46:42.643Z",
  id: PERSISTED_ROW_ID,
  metadata: { signal: { id: SIGNAL_ID, tagName: "user", type: "user" } },
  parts: [{ text: TEXT, type: "text" }],
  role: "user",
};

describe("persisting a user turn twice across a resume", () => {
  it("matches the existing row by SIGNAL id when the message id differs", async () => {
    const { appendMessage, storage } = buildStorage([PERSISTED_USER_ROW]);

    // The resume re-saves the same turn under a different message id.
    await storage.saveMessages({
      messages: [userSignalMessage(SIGNAL_ID)] as never,
    });

    expect(appendMessage).not.toHaveBeenCalled();
  });

  it("still inserts a genuinely new user turn", async () => {
    // The guard must not swallow the next question the user asks.
    const { appendMessage, storage } = buildStorage([PERSISTED_USER_ROW]);
    const next = userSignalMessage("a-different-message");
    next.content.metadata.signal.id = "99999999-9999-4999-8999-999999999999";
    next.content.parts = [{ text: "und jetzt blau", type: "text" }];

    await storage.saveMessages({ messages: [next] as never });

    expect(appendMessage).toHaveBeenCalledTimes(1);
  });

  it("skips inserting the current user turn when persistCurrentUserTurn is false", async () => {
    const appendMessage = vi.fn(async () => ({
      message: { id: "generated", parts: [], role: "user" },
    }));
    const store = {
      appendMessage,
      getThread: async () => ({ agent_id: "engenty.copilot", id: THREAD_ID }),
      listMessagesOrdered: async () => [],
      updateMessageParts: vi.fn(),
    } as unknown as ThreadStore;
    const storage = createEngentySessionMemoryStorage({
      agentId: "engenty.copilot",
      persistCurrentUserTurn: false,
      scope: { tenantId: TENANT_ID, userId: USER_ID },
      store,
    });

    await storage.saveMessages({
      messages: [userSignalMessage(SIGNAL_ID)] as never,
    });

    expect(appendMessage).not.toHaveBeenCalled();
  });

  it("inserts the first copy when the thread has no rows yet", async () => {
    const { appendMessage, storage } = buildStorage([]);

    await storage.saveMessages({
      messages: [userSignalMessage(SIGNAL_ID)] as never,
    });

    expect(appendMessage).toHaveBeenCalledTimes(1);
  });

  it("does not match an ASSISTANT row that happens to carry a signal id", async () => {
    // `userSignalIdOfRow` is role-gated: assistant rows have their own re-save
    // path (updateMessageParts), and folding a user turn onto one would rewrite
    // the model's answer with the question.
    const { appendMessage, storage } = buildStorage([
      { ...PERSISTED_USER_ROW, id: "assistant-row", role: "assistant" },
    ]);

    await storage.saveMessages({
      messages: [userSignalMessage(SIGNAL_ID)] as never,
    });

    expect(appendMessage).toHaveBeenCalledTimes(1);
  });
});
