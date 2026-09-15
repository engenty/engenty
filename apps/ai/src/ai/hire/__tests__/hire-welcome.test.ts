import { describe, expect, it, vi } from "vitest";
import { ensureHireWelcome } from "../hire-welcome.js";
import { HIRE_WELCOME_SOURCE } from "../hire-welcome-text.js";

const tenantId = "tenant-1";
const spaceId = "space-1";
const userId = "user-1";
const agent = {
  description: "Keeps the space moving.",
  id: "chief-of-staff",
  instructions: "You are Chief of Staff.",
  name: "Chief of Staff",
};

const THREAD_CREATED_AT = "2026-09-14T12:00:00.000Z";

describe("ensureHireWelcome", () => {
  it("posts the fallback at once, pinned to the thread's creation, then upgrades the text", async () => {
    const appendMessage = vi.fn(async () => ({ message: { id: "m1" } }));
    const updateMessageParts = vi.fn(async () => ({ message: { id: "m1" } }));
    const store = {
      appendMessage,
      listMessagesOrdered: vi.fn(async () => []),
      listThreadsForSpaceAgent: vi.fn(async () => []),
      getThread: vi.fn(async (input: { threadId: string }) => ({
        created_at: THREAD_CREATED_AT,
        id: input.threadId,
      })),
      updateMessageParts,
      upsertThread: vi.fn(async (input: { id: string }) => ({
        thread: { id: input.id },
      })),
    };
    const result = await ensureHireWelcome({
      agent,
      generate: async () => "Welcome — let's pick a first job.",
      locale: "en",
      ownerUserId: userId,
      spaceId,
      store: store as never,
      tenantId,
    });
    expect(result?.created).toBe(true);
    expect(result?.threadId).toBeTruthy();
    expect(appendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        createdAt: THREAD_CREATED_AT,
        metadata: { source: HIRE_WELCOME_SOURCE },
        role: "assistant",
        tenantId,
      })
    );
    const appended = (appendMessage.mock.calls as unknown[][])[0]?.[0] as {
      id: string;
      parts: { text: string }[];
    };
    expect(appended.parts[0]?.text).toContain("I'm Chief of Staff");
    expect(updateMessageParts).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: appended.id,
        parts: [{ text: "Welcome — let's pick a first job.", type: "text" }],
      })
    );
  });

  it("keeps the welcome first when a person writes while the model is still answering", async () => {
    // The person's turn lands between the row write and the model's answer:
    // the welcome must already be on the thread, stamped with the thread's own
    // creation, so (created_at, id) order puts it first whatever the clock.
    const rows: { created_at: string; id: string; text: string }[] = [];
    const appendMessage = vi.fn(
      async (input: {
        createdAt?: string;
        id: string;
        parts: { text: string }[];
      }) => {
        rows.push({
          created_at: input.createdAt ?? "2026-09-14T12:00:03.000Z",
          id: input.id,
          text: input.parts[0]?.text ?? "",
        });
        return { message: { id: input.id } };
      }
    );
    const updateMessageParts = vi.fn(
      async (input: { messageId: string; parts: { text: string }[] }) => {
        const row = rows.find((entry) => entry.id === input.messageId);
        if (row) {
          row.text = input.parts[0]?.text ?? row.text;
        }
        return { message: { id: input.messageId } };
      }
    );
    const store = {
      appendMessage,
      listMessagesOrdered: vi.fn(async () => []),
      listThreadsForSpaceAgent: vi.fn(async () => []),
      getThread: vi.fn(async (input: { threadId: string }) => ({
        created_at: THREAD_CREATED_AT,
        id: input.threadId,
      })),
      updateMessageParts,
      upsertThread: vi.fn(async (input: { id: string }) => ({
        thread: { id: input.id },
      })),
    };
    await ensureHireWelcome({
      agent,
      generate: async () => {
        // The person types while the model is thinking.
        rows.push({
          created_at: "2026-09-14T12:00:01.000Z",
          id: "user-turn",
          text: "Hi, can you start with the inbox?",
        });
        return "Hello — inbox it is.";
      },
      locale: "en",
      ownerUserId: userId,
      spaceId,
      store: store as never,
      tenantId,
    });
    const ordered = rows.toSorted(
      (left, right) =>
        left.created_at.localeCompare(right.created_at) ||
        left.id.localeCompare(right.id)
    );
    expect(ordered.map((row) => row.text)).toEqual([
      "Hello — inbox it is.",
      "Hi, can you start with the inbox?",
    ]);
  });

  it("leaves the fallback in place when the model has nothing better", async () => {
    const updateMessageParts = vi.fn();
    const store = {
      appendMessage: vi.fn(async () => ({ message: { id: "m1" } })),
      listMessagesOrdered: vi.fn(async () => []),
      listThreadsForSpaceAgent: vi.fn(async () => []),
      getThread: vi.fn(async () => null),
      updateMessageParts,
      upsertThread: vi.fn(async (input: { id: string }) => ({
        thread: { id: input.id },
      })),
    };
    const result = await ensureHireWelcome({
      agent,
      generate: async () => "   ",
      locale: "en",
      ownerUserId: userId,
      spaceId,
      store: store as never,
      tenantId,
    });
    expect(result?.created).toBe(true);
    expect(updateMessageParts).not.toHaveBeenCalled();
  });

  it("does not post again when the desk already has a message", async () => {
    const appendMessage = vi.fn();
    const store = {
      appendMessage,
      listMessagesOrdered: vi.fn(async () => [{ id: "already" }]),
      listThreadsForSpaceAgent: vi.fn(async () => [
        {
          agent_id: agent.id,
          created_by_user_id: userId,
          id: "existing",
          updated_at: "2026-09-14T00:00:00.000Z",
        },
      ]),
      getThread: vi.fn(async () => null),
      upsertThread: vi.fn(),
    };
    const result = await ensureHireWelcome({
      agent,
      locale: "en",
      ownerUserId: userId,
      spaceId,
      store: store as never,
      tenantId,
    });
    expect(result).toEqual({ created: false, threadId: "existing" });
    expect(appendMessage).not.toHaveBeenCalled();
  });
});
