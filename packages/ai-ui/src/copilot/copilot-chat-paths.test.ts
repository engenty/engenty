import { describe, expect, it } from "vitest";
import {
  COPILOT_CHAT_NEW,
  COPILOT_CHAT_ROOT,
  COPILOT_SUB_RUN_QUERY,
  copilotChatSubRunPath,
  defaultCopilotSessionPath,
  readCopilotSubRunToolCallId,
  resolveFullscreenCopilotChatPath,
} from "./copilot-chat-paths.js";

const THREAD_ID = "11111111-1111-4111-8111-111111111111";

describe("copilot-chat-paths", () => {
  it("exposes stable full-page chat route constants", () => {
    expect(COPILOT_CHAT_ROOT).toBe("/mdl/engenty-copilot/chat");
    expect(COPILOT_CHAT_NEW).toBe(`${COPILOT_CHAT_ROOT}/new`);
  });

  it("builds encoded session paths for navigate-after-send", () => {
    expect(defaultCopilotSessionPath(THREAD_ID)).toBe(
      `${COPILOT_CHAT_ROOT}/${THREAD_ID}`
    );
    expect(defaultCopilotSessionPath("a/b")).toBe(
      `${COPILOT_CHAT_ROOT}/${encodeURIComponent("a/b")}`
    );
  });

  it("resolves full-screen chat paths from the active thread", () => {
    expect(resolveFullscreenCopilotChatPath(THREAD_ID)).toBe(
      `${COPILOT_CHAT_ROOT}/${THREAD_ID}`
    );
    expect(resolveFullscreenCopilotChatPath(` ${THREAD_ID} `)).toBe(
      `${COPILOT_CHAT_ROOT}/${THREAD_ID}`
    );
    expect(resolveFullscreenCopilotChatPath("tmp:draft")).toBe(
      COPILOT_CHAT_ROOT
    );
    expect(resolveFullscreenCopilotChatPath(null)).toBe(COPILOT_CHAT_ROOT);
    expect(resolveFullscreenCopilotChatPath(undefined)).toBe(COPILOT_CHAT_ROOT);
  });

  it("builds sub-run monitor URLs with encoded toolCallId", () => {
    const toolCallId = "call/sub+agent";
    expect(copilotChatSubRunPath(THREAD_ID, toolCallId)).toBe(
      `${COPILOT_CHAT_ROOT}/${THREAD_ID}?${COPILOT_SUB_RUN_QUERY}=${encodeURIComponent(toolCallId)}`
    );
  });

  it("reads subRun query param from search strings", () => {
    expect(readCopilotSubRunToolCallId("")).toBeNull();
    expect(readCopilotSubRunToolCallId("?other=1")).toBeNull();
    expect(readCopilotSubRunToolCallId("?subRun=call-1")).toBe("call-1");
    expect(readCopilotSubRunToolCallId("subRun=call%2F2")).toBe("call/2");
  });
});
