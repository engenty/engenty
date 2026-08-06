/** @vitest-environment happy-dom */
import { EngentyQueryProvider } from "@engenty/query-client";
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ENGENTY_COPILOT_HOST_KEY } from "../agent-provider/host-keys.js";
import {
  TEMPORARY_ENGENTY_THREAD_ID_PREFIX,
  useEngentyThreads,
} from "./use-engenty-threads.js";

const setActiveThreadId = vi.fn();
const upsertDraftThread = vi.fn();

const ctx = {
  archiveThread: vi.fn(),
  clearThreads: vi.fn(),
  deleteThread: vi.fn(),
  getActiveDraftThreadId: vi.fn(() => null),
  getActiveThreadId: vi.fn(() => null),
  getDraftThreads: vi.fn(() => []),
  isTransportReady: true,
  renameThread: vi.fn(),
  serviceBaseUrl: "https://svc.example",
  setActiveThreadId,
  tenantId: "tenant-1",
  threadsListQueryKey: () => ["apps-ai", "sessions", "list"],
  upsertDraftThread,
  userId: "user-1",
};

vi.mock("./engenty-threads-provider.js", () => ({
  useEngentyThreadsContext: () => ctx,
}));

vi.mock("../ag-ui/apps-ai/apps-ai-thread-api.js", () => ({
  useAppsAiThreadsQuery: () => ({
    data: [],
    error: null,
    isLoading: false,
  }),
}));

function wrapper({ children }: { children: ReactNode }) {
  return createElement(EngentyQueryProvider, null, children);
}

describe("useEngentyThreads CK shape (Ch.8)", () => {
  afterEach(() => vi.clearAllMocks());

  it("createThread opens an active draft and returns its temporary id", () => {
    const { result } = renderHook(
      () => useEngentyThreads(ENGENTY_COPILOT_HOST_KEY),
      { wrapper }
    );

    const id = result.current.createThread({ title: "New chat" });

    expect(id.startsWith(TEMPORARY_ENGENTY_THREAD_ID_PREFIX)).toBe(true);
    expect(upsertDraftThread).toHaveBeenCalledTimes(1);
    const [hostKey, draft] = upsertDraftThread.mock.calls[0];
    expect(hostKey).toBe(ENGENTY_COPILOT_HOST_KEY);
    expect(draft).toMatchObject({
      id,
      status: "draft",
      tenant_id: "tenant-1",
      title: "New chat",
    });
    expect(draft.route_context).toMatchObject({
      host_key: ENGENTY_COPILOT_HOST_KEY,
    });
    // The draft id is `tmp:` and can't be persisted; createThread clears any stale
    // persisted active so the freshly-upserted draft wins in resolution.
    expect(setActiveThreadId).toHaveBeenCalledWith(
      ENGENTY_COPILOT_HOST_KEY,
      null
    );
  });

  it("surfaces an active draft as activeThreadId when none is persisted", () => {
    ctx.getActiveThreadId.mockReturnValue(null);
    ctx.getActiveDraftThreadId.mockReturnValue("tmp:draft-1");

    const { result } = renderHook(
      () => useEngentyThreads(ENGENTY_COPILOT_HOST_KEY),
      { wrapper }
    );

    expect(result.current.activeThreadId).toBe("tmp:draft-1");
  });

  it("prefers the persisted (durable) active thread over a draft", () => {
    ctx.getActiveThreadId.mockReturnValue(
      "11111111-1111-4111-8111-111111111111"
    );
    ctx.getActiveDraftThreadId.mockReturnValue("tmp:draft-1");

    const { result } = renderHook(
      () => useEngentyThreads(ENGENTY_COPILOT_HOST_KEY),
      { wrapper }
    );

    expect(result.current.activeThreadId).toBe(
      "11111111-1111-4111-8111-111111111111"
    );
  });

  it("switchThread is an alias for setActiveThreadId", () => {
    const { result } = renderHook(
      () => useEngentyThreads(ENGENTY_COPILOT_HOST_KEY),
      { wrapper }
    );

    result.current.switchThread("11111111-1111-4111-8111-111111111111");

    expect(setActiveThreadId).toHaveBeenCalledWith(
      ENGENTY_COPILOT_HOST_KEY,
      "11111111-1111-4111-8111-111111111111"
    );
  });
});
