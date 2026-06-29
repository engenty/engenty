/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it } from "vitest";
import {
  bumpActiveCopilotNewChatGeneration,
  readActiveCopilotNewChatGeneration,
  resolveActiveCopilotHostThreadId,
  resolveActiveCopilotStableSessionKey,
  resolvePendingCopilotThreadNavigate,
  shouldPersistCopilotUrlThreadToLastActive,
  shouldReconcileCopilotStaleSessionUrl,
} from "./active-copilot-controller.js";

const SESSION_A = "11111111-1111-4111-8111-111111111111";
const SESSION_B = "22222222-2222-4222-8222-222222222222";
const SESSION_C = "33333333-3333-4333-8333-333333333333";
const CHAT_ROOT = "/mdl/engenty-copilot/chat";

const baseBindingInput = {
  isChatIndexRoute: false,
  isFullPageChatRoute: false,
  isNewChatRoute: false,
  lastActiveThreadId: null as string | null,
  pathname: "/mdl/contacts",
};

describe("resolveActiveCopilotHostThreadId", () => {
  it("binds URL uuid on full-page chat and ignores last-active", () => {
    const result = resolveActiveCopilotHostThreadId({
      ...baseBindingInput,
      isFullPageChatRoute: true,
      lastActiveThreadId: SESSION_B,
      pathname: `${CHAT_ROOT}/${SESSION_A}`,
    });
    expect(result.authoritativeUrlThreadId).toBe(SESSION_A);
    expect(result.activeThreadId).toBe(SESSION_A);
  });

  it("binds last-active on /chat index", () => {
    const result = resolveActiveCopilotHostThreadId({
      ...baseBindingInput,
      isChatIndexRoute: true,
      isFullPageChatRoute: true,
      lastActiveThreadId: SESSION_B,
      pathname: CHAT_ROOT,
    });
    expect(result.authoritativeUrlThreadId).toBeNull();
    expect(result.activeThreadId).toBe(SESSION_B);
  });

  it("unbinds on /chat index when last-active is missing", () => {
    const result = resolveActiveCopilotHostThreadId({
      ...baseBindingInput,
      isChatIndexRoute: true,
      isFullPageChatRoute: true,
      lastActiveThreadId: null,
      pathname: CHAT_ROOT,
    });
    expect(result.authoritativeUrlThreadId).toBeNull();
    expect(result.activeThreadId).toBeNull();
  });

  it("uses last-active on shell routes only", () => {
    const result = resolveActiveCopilotHostThreadId({
      ...baseBindingInput,
      lastActiveThreadId: SESSION_A,
      pathname: "/mdl/contacts/1",
    });
    expect(result.authoritativeUrlThreadId).toBeNull();
    expect(result.activeThreadId).toBe(SESSION_A);
  });

  it("unbinds on /chat/new", () => {
    const result = resolveActiveCopilotHostThreadId({
      ...baseBindingInput,
      isFullPageChatRoute: true,
      isNewChatRoute: true,
      lastActiveThreadId: SESSION_A,
      pathname: `${CHAT_ROOT}/new`,
    });
    expect(result.authoritativeUrlThreadId).toBeNull();
    expect(result.activeThreadId).toBeNull();
  });
});

describe("resolvePendingCopilotThreadNavigate", () => {
  it("navigates during an active first run once the server thread exists", () => {
    expect(
      resolvePendingCopilotThreadNavigate({
        authoritativeUrlThreadId: null,
        hostReady: false,
        isFullPageChatRoute: true,
        pendingThreadId: SESSION_A,
        routeThreadId: null,
      })
    ).toEqual({ type: "navigate", threadId: SESSION_A });
  });

  it("navigates on full-page chat when last-active bound but URL still /new", () => {
    expect(
      resolvePendingCopilotThreadNavigate({
        authoritativeUrlThreadId: null,
        hostReady: true,
        isFullPageChatRoute: true,
        pendingThreadId: SESSION_A,
        routeThreadId: null,
      })
    ).toEqual({ type: "navigate", threadId: SESSION_A });
  });

  it("clears when the session URL already matches", () => {
    expect(
      resolvePendingCopilotThreadNavigate({
        authoritativeUrlThreadId: SESSION_A,
        hostReady: true,
        isFullPageChatRoute: true,
        pendingThreadId: SESSION_A,
        routeThreadId: SESSION_A,
      })
    ).toEqual({ type: "clear" });
  });

  it("clears without hijacking route when shell left full-page chat", () => {
    expect(
      resolvePendingCopilotThreadNavigate({
        authoritativeUrlThreadId: null,
        hostReady: true,
        isFullPageChatRoute: false,
        pendingThreadId: SESSION_A,
        routeThreadId: null,
      })
    ).toEqual({ type: "clear" });
  });
});

describe("shouldPersistCopilotUrlThreadToLastActive", () => {
  it("persists when last-active is empty and no pending mismatch", () => {
    expect(
      shouldPersistCopilotUrlThreadToLastActive({
        authoritativeUrlThreadId: SESSION_A,
        pendingUrlThreadId: null,
        persistedLastActive: null,
      })
    ).toBe(true);
  });

  it("does not clobber a newer last-active with a stale address-bar id", () => {
    expect(
      shouldPersistCopilotUrlThreadToLastActive({
        authoritativeUrlThreadId: SESSION_B,
        pendingUrlThreadId: SESSION_A,
        persistedLastActive: SESSION_A,
      })
    ).toBe(false);
  });

  it("does not persist when pending points at a different created thread", () => {
    expect(
      shouldPersistCopilotUrlThreadToLastActive({
        authoritativeUrlThreadId: SESSION_B,
        pendingUrlThreadId: SESSION_A,
        persistedLastActive: SESSION_C,
      })
    ).toBe(false);
  });
});

describe("shouldReconcileCopilotStaleSessionUrl", () => {
  it("replaces stale session URL when pending matches last-active", () => {
    expect(
      shouldReconcileCopilotStaleSessionUrl({
        authoritativeUrlThreadId: SESSION_B,
        isFullPageChatRoute: true,
        pendingUrlThreadId: SESSION_A,
        persistedLastActive: SESSION_A,
      })
    ).toBe(true);
  });

  it("skips reconcile when URL already matches last-active", () => {
    expect(
      shouldReconcileCopilotStaleSessionUrl({
        authoritativeUrlThreadId: SESSION_A,
        isFullPageChatRoute: true,
        pendingUrlThreadId: SESSION_A,
        persistedLastActive: SESSION_A,
      })
    ).toBe(false);
  });
});

describe("active-copilot-controller", () => {
  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("persists new-chat generation in sessionStorage", () => {
    const first = readActiveCopilotNewChatGeneration();
    expect(first.length).toBeGreaterThan(0);
    expect(readActiveCopilotNewChatGeneration()).toBe(first);

    const next = bumpActiveCopilotNewChatGeneration();
    expect(next).not.toBe(first);
    expect(readActiveCopilotNewChatGeneration()).toBe(next);
  });

  it("builds stable session keys with optional generation", () => {
    const without = resolveActiveCopilotStableSessionKey({
      agentId: "engenty.copilot",
      tenantId: "t1",
      userId: "u1",
    });
    expect(without).toMatch(/^engenty-agent-affinity:active-v1:/);

    const withGen = resolveActiveCopilotStableSessionKey({
      agentId: "engenty.copilot",
      newChatGeneration: "gen-1",
      tenantId: "t1",
      userId: "u1",
    });
    expect(withGen).toContain(":new:gen-1");
    expect(withGen).not.toBe(without);
  });
});
