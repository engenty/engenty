import { describe, expect, it } from "vitest";
import {
  type ChatModePick,
  chatModeRunConfig,
  DEFAULT_CHAT_MODE_PICK,
  isExtraAllowed,
  resolveChatModePick,
  threadChatModePick,
} from "./chat-mode.js";

const claude = { reasoning_effort: true, ref: "anthropic/claude-sonnet-5" };
const llama = { reasoning_effort: false, ref: "meta/llama-4" };

function pick(overrides: Partial<ChatModePick>): ChatModePick {
  return { ...DEFAULT_CHAT_MODE_PICK, ...overrides };
}

const freshThread = { extraTakesReasoning: true, threadHasServerMode: false };

describe("isExtraAllowed", () => {
  it("withholds Extra only on a Normal-only plan", () => {
    expect(isExtraAllowed(null)).toBe(true);
    expect(isExtraAllowed(["normal", "high"])).toBe(true);
    expect(isExtraAllowed(["normal"])).toBe(false);
  });
});

describe("resolveChatModePick", () => {
  it("falls back to Normal when the plan does not allow Extra", () => {
    const resolved = resolveChatModePick(pick({ mode: "extra" }), {
      customModels: [],
      extraAllowed: false,
    });
    expect(chatModeRunConfig(resolved, freshThread).effort).toBe("auto");
  });

  it("falls back to Normal, unpinned, when the model left the Custom list", () => {
    const resolved = resolveChatModePick(
      pick({ customModel: "openai/gone", mode: "custom" }),
      { customModels: [claude], extraAllowed: true }
    );
    expect(chatModeRunConfig(resolved, freshThread)).toEqual({
      effort: "auto",
      modelId: null,
      reasoningEffort: null,
    });
  });

  it("keeps a Custom pick while the list is still loading", () => {
    const stored = pick({ customModel: claude.ref, mode: "custom" });
    expect(
      resolveChatModePick(stored, {
        customModels: undefined,
        extraAllowed: true,
      })
    ).toEqual(stored);
  });

  it("drops a reasoning level the Custom model cannot take", () => {
    const resolved = resolveChatModePick(
      pick({ customModel: llama.ref, customReasoning: "high", mode: "custom" }),
      { customModels: [claude, llama], extraAllowed: true }
    );
    expect(chatModeRunConfig(resolved, freshThread)).toEqual({
      effort: null,
      modelId: llama.ref,
      reasoningEffort: null,
    });
  });
});

describe("chatModeRunConfig", () => {
  it("sends Normal as auto, so the server may offer Extra", () => {
    expect(chatModeRunConfig(pick({}), freshThread).effort).toBe("auto");
  });

  it("steps a thread the server holds on Extra down with an explicit normal", () => {
    expect(
      chatModeRunConfig(pick({}), {
        extraTakesReasoning: true,
        threadHasServerMode: true,
      }).effort
    ).toBe("normal");
  });

  it("sends Extra as high at the picked level when the Extra model takes one", () => {
    expect(
      chatModeRunConfig(pick({ extraReasoning: "medium", mode: "extra" }), {
        extraTakesReasoning: true,
        threadHasServerMode: false,
      })
    ).toEqual({ effort: "high", modelId: null, reasoningEffort: "medium" });
  });

  it("sends Extra without a level when the Extra model takes none or is unknown", () => {
    for (const extraTakesReasoning of [false, undefined]) {
      expect(
        chatModeRunConfig(pick({ mode: "extra" }), {
          extraTakesReasoning,
          threadHasServerMode: false,
        }).reasoningEffort
      ).toBeNull();
    }
  });

  it("sends Custom as the pinned model at its level, with no tier", () => {
    expect(
      chatModeRunConfig(
        pick({
          customModel: claude.ref,
          customReasoning: "medium",
          mode: "custom",
        }),
        freshThread
      )
    ).toEqual({ effort: null, modelId: claude.ref, reasoningEffort: "medium" });
  });
});

describe("threadChatModePick", () => {
  const base = DEFAULT_CHAT_MODE_PICK;

  it("is Normal for a thread with no draft and no server mode", () => {
    expect(
      threadChatModePick({
        base,
        chatMode: undefined,
        draft: undefined,
        metadataReadAt: 0,
      }).pick.mode
    ).toBe("normal");
  });

  it("follows the thread's server mode — Extra at its level, or the pinned Custom model", () => {
    expect(
      threadChatModePick({
        base,
        chatMode: { mode: "extra", reasoning_effort: "low" },
        draft: undefined,
        metadataReadAt: 1,
      }).pick
    ).toMatchObject({ extraReasoning: "low", mode: "extra" });
    expect(
      threadChatModePick({
        base,
        chatMode: { mode: "custom", model_id: claude.ref },
        draft: undefined,
        metadataReadAt: 1,
      }).pick
    ).toMatchObject({ customModel: claude.ref, mode: "custom" });
  });

  it("lets the person's draft win over the server until a later run's metadata is read", () => {
    const draft = { pick: pick({ mode: "normal" }), settledAt: null };
    const extraThread = { mode: "extra", reasoning_effort: null };
    expect(
      threadChatModePick({
        base,
        chatMode: extraThread,
        draft,
        metadataReadAt: 500,
      }).pick.mode
    ).toBe("normal");

    const settled = { ...draft, settledAt: 1000 };
    // Metadata still from before the run finished: the draft holds.
    expect(
      threadChatModePick({
        base,
        chatMode: extraThread,
        draft: settled,
        metadataReadAt: 900,
      }).pick.mode
    ).toBe("normal");
    // Read again after the run: the server's word is the truth.
    const after = threadChatModePick({
      base,
      chatMode: extraThread,
      draft: settled,
      metadataReadAt: 1100,
    });
    expect(after.pick.mode).toBe("extra");
    expect(after.draftSuperseded).toBe(true);
  });
});
