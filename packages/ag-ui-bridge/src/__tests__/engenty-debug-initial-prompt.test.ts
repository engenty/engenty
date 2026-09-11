import { describe, expect, it } from "vitest";
import {
  ENGENTY_DEBUG_INITIAL_PROMPT_EVENT,
  historySpeakerKey,
  readEngentyDebugInitialPrompt,
} from "../engenty-debug-initial-prompt.js";

describe("readEngentyDebugInitialPrompt", () => {
  it("parses the SYSTEM + CONTEXT snapshot", () => {
    expect(
      readEngentyDebugInitialPrompt({
        runtimeContextInstructions: "Space: company",
        systemInstructions: "You are the copilot.",
        toolNames: ["navigate"],
      })
    ).toEqual({
      runtimeContextInstructions: "Space: company",
      systemInstructions: "You are the copilot.",
      toolNames: ["navigate"],
    });
  });

  it("keeps a legacy modelMessages payload", () => {
    expect(
      readEngentyDebugInitialPrompt({
        modelMessages: [{ content: "You are a coding agent.", role: "system" }],
        runtimeContextInstructions: "Read-only",
      })
    ).toMatchObject({
      modelMessages: [{ content: "You are a coding agent.", role: "system" }],
      runtimeContextInstructions: "Read-only",
      systemInstructions: "",
    });
  });

  it("parses recalled message pointers", () => {
    expect(
      readEngentyDebugInitialPrompt({
        recalledMessages: [
          {
            authorUserId: "user-1",
            chars: 240,
            id: "msg-1",
            preview: "Aktienkurse alle 10 Minuten",
            role: "user",
          },
        ],
        runtimeContextInstructions: "",
        systemInstructions: "",
        toolNames: [],
      })
    ).toEqual({
      recalledMessages: [
        {
          authorUserId: "user-1",
          chars: 240,
          id: "msg-1",
          preview: "Aktienkurse alle 10 Minuten",
          role: "user",
        },
      ],
      runtimeContextInstructions: "",
      systemInstructions: "",
      toolNames: [],
    });
  });

  it("keeps an explicit null author as unattended, and omits a missing one", () => {
    expect(
      readEngentyDebugInitialPrompt({
        recalledMessages: [
          {
            authorUserId: null,
            chars: 12,
            id: "msg-synth",
            preview: "tick",
            role: "user",
          },
          {
            chars: 8,
            id: "msg-legacy",
            preview: "hello",
            role: "user",
          },
        ],
        systemInstructions: "x",
      })
    ).toMatchObject({
      recalledMessages: [
        {
          authorUserId: null,
          id: "msg-synth",
          role: "user",
        },
        {
          id: "msg-legacy",
          role: "user",
        },
      ],
    });
    expect(
      readEngentyDebugInitialPrompt({
        recalledMessages: [
          {
            chars: 8,
            id: "msg-legacy",
            preview: "hello",
            role: "user",
          },
        ],
        systemInstructions: "x",
      })?.recalledMessages?.[0]
    ).not.toHaveProperty("authorUserId");
  });

  it("rejects an empty object", () => {
    expect(readEngentyDebugInitialPrompt({})).toBeNull();
  });
});

describe("historySpeakerKey", () => {
  it("tags a user-role pointer as human, agent, or legacy user", () => {
    expect(
      historySpeakerKey({
        authorUserId: "user-1",
        chars: 1,
        id: "a",
        preview: "hi",
        role: "user",
      })
    ).toBe("human");
    expect(
      historySpeakerKey({
        authorUserId: null,
        chars: 1,
        id: "b",
        preview: "tick",
        role: "user",
      })
    ).toBe("agent");
    expect(
      historySpeakerKey({
        chars: 1,
        id: "c",
        preview: "hello",
        role: "user",
      })
    ).toBe("user");
    expect(
      historySpeakerKey({
        chars: 1,
        id: "d",
        preview: "ok",
        role: "assistant",
      })
    ).toBe("assistant");
  });
});

describe("ENGENTY_DEBUG_INITIAL_PROMPT_EVENT", () => {
  it("keeps the namespaced CUSTOM event id stable", () => {
    expect(ENGENTY_DEBUG_INITIAL_PROMPT_EVENT).toBe(
      "engenty.debug.initial_prompt"
    );
  });
});
