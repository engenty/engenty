import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCopilotLocalRecoveryStorageKey,
  clearAllCopilotLocalRecoveryForUser,
  clearCopilotComposerDraft,
  extractLastUserMessageText,
  isCopilotComposerDraftRecoveryEnabled,
  moveCopilotComposerDraft,
  readCopilotComposerDraft,
  writeCopilotComposerDraft,
} from "./local-recovery.js";

describe("copilot local recovery", () => {
  const storage = new Map<string, string>();

  afterEach(() => {
    storage.clear();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.stubGlobal("window", {
      localStorage: {
        get length() {
          return storage.size;
        },
        key: (index: number) => [...storage.keys()][index] ?? null,
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
    });
  });

  it("builds tenant-scoped storage keys", () => {
    expect(
      buildCopilotLocalRecoveryStorageKey({
        tenantId: "t1",
        userId: "u1",
        threadId: "new",
      })
    ).toBe("engenty:copilot:recovery:t1:u1:new");
  });

  it("enables composer recovery unless explicitly disabled", () => {
    expect(isCopilotComposerDraftRecoveryEnabled()).toBe(true);
  });

  it("round-trips composer draft text", () => {
    writeCopilotComposerDraft({
      tenantId: "t1",
      userId: "u1",
      threadId: "sess-1",
      composerDraft: "hello draft",
    });
    expect(
      readCopilotComposerDraft({
        tenantId: "t1",
        userId: "u1",
        threadId: "sess-1",
      })
    ).toBe("hello draft");
  });

  it("moves composer drafts from a temporary thread id to the server thread id", () => {
    writeCopilotComposerDraft({
      tenantId: "t1",
      userId: "u1",
      threadId: "tmp:gen-1",
      composerDraft: "unsent text",
    });

    moveCopilotComposerDraft({
      tenantId: "t1",
      userId: "u1",
      fromThreadId: "tmp:gen-1",
      toThreadId: "sess-1",
    });

    expect(
      readCopilotComposerDraft({
        tenantId: "t1",
        userId: "u1",
        threadId: "tmp:gen-1",
      })
    ).toBe("");
    expect(
      readCopilotComposerDraft({
        tenantId: "t1",
        userId: "u1",
        threadId: "sess-1",
      })
    ).toBe("unsent text");
  });

  it("clears draft storage", () => {
    writeCopilotComposerDraft({
      tenantId: "t1",
      userId: "u1",
      threadId: "sess-1",
      composerDraft: "draft",
    });
    clearCopilotComposerDraft({
      tenantId: "t1",
      userId: "u1",
      threadId: "sess-1",
    });
    expect(
      readCopilotComposerDraft({
        tenantId: "t1",
        userId: "u1",
        threadId: "sess-1",
      })
    ).toBe("");
  });

  it("rejects mismatched tenant in stored payload", () => {
    const key = buildCopilotLocalRecoveryStorageKey({
      tenantId: "t1",
      userId: "u1",
      threadId: "sess-1",
    });
    storage.set(
      key,
      JSON.stringify({
        version: 1,
        tenantId: "other",
        userId: "u1",
        threadId: "sess-1",
        composerDraft: "x",
      })
    );
    expect(
      readCopilotComposerDraft({
        tenantId: "t1",
        userId: "u1",
        threadId: "sess-1",
      })
    ).toBe("");
  });

  it("clears all recovery keys for a tenant user", () => {
    writeCopilotComposerDraft({
      tenantId: "t1",
      userId: "u1",
      threadId: "sess-1",
      composerDraft: "draft one",
    });
    writeCopilotComposerDraft({
      tenantId: "t1",
      userId: "u1",
      threadId: "new",
      composerDraft: "draft two",
    });
    writeCopilotComposerDraft({
      tenantId: "t1",
      userId: "u2",
      threadId: "sess-1",
      composerDraft: "other user",
    });

    clearAllCopilotLocalRecoveryForUser({ tenantId: "t1", userId: "u1" });

    expect(
      readCopilotComposerDraft({
        tenantId: "t1",
        userId: "u1",
        threadId: "sess-1",
      })
    ).toBe("");
    expect(
      readCopilotComposerDraft({
        tenantId: "t1",
        userId: "u1",
        threadId: "new",
      })
    ).toBe("");
    expect(
      readCopilotComposerDraft({
        tenantId: "t1",
        userId: "u2",
        threadId: "sess-1",
      })
    ).toBe("other user");
  });

  it("extracts last user message text from AG-UI parts", () => {
    expect(
      extractLastUserMessageText([
        { role: "assistant", content: [{ type: "text", text: "hi" }] },
        { role: "user", content: [{ type: "text", text: "  question  " }] },
      ])
    ).toBe("question");
  });
});
