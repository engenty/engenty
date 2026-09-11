import { describe, expect, it } from "vitest";
import {
  COPILOT_CHAT_NEW,
  COPILOT_CHAT_ROOT,
  COPILOT_SUB_RUN_QUERY,
  canonicalCopilotChatPathname,
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

  describe("canonicalCopilotChatPathname", () => {
    it("strips the space prefix off a chat deep link", () => {
      expect(
        canonicalCopilotChatPathname(`/s/matthias/copilot/chat/${THREAD_ID}`)
      ).toBe(`${COPILOT_CHAT_ROOT}/${THREAD_ID}`);
      expect(canonicalCopilotChatPathname("/s/company/copilot/chat/new")).toBe(
        COPILOT_CHAT_NEW
      );
      expect(canonicalCopilotChatPathname("/s/company/copilot/chat")).toBe(
        COPILOT_CHAT_ROOT
      );
    });

    it("accepts the canonical module id as a space segment", () => {
      // Links minted before the `copilot` alias existed are still in flight.
      expect(
        canonicalCopilotChatPathname(
          `/s/company/engenty-copilot/chat/${THREAD_ID}`
        )
      ).toBe(`${COPILOT_CHAT_ROOT}/${THREAD_ID}`);
    });

    it("leaves another module's space route alone", () => {
      expect(canonicalCopilotChatPathname("/s/company/tasks/chat/x")).toBe(
        "/s/company/tasks/chat/x"
      );
      expect(canonicalCopilotChatPathname("/s/company/settings")).toBe(
        "/s/company/settings"
      );
    });

    it("passes an already-canonical path through untouched", () => {
      expect(
        canonicalCopilotChatPathname(`${COPILOT_CHAT_ROOT}/${THREAD_ID}`)
      ).toBe(`${COPILOT_CHAT_ROOT}/${THREAD_ID}`);
      expect(canonicalCopilotChatPathname("/mdl/tasks/briefing")).toBe(
        "/mdl/tasks/briefing"
      );
      expect(canonicalCopilotChatPathname("/s/company")).toBe("/s/company");
    });
  });

  it("reads subRun query param from search strings", () => {
    expect(readCopilotSubRunToolCallId("")).toBeNull();
    expect(readCopilotSubRunToolCallId("?other=1")).toBeNull();
    expect(readCopilotSubRunToolCallId("?subRun=call-1")).toBe("call-1");
    expect(readCopilotSubRunToolCallId("subRun=call%2F2")).toBe("call/2");
  });
});
