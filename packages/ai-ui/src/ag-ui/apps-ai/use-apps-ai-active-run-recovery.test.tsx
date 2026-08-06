/** @vitest-environment happy-dom */
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cancelAiRun,
  getAiRunEvents,
  getAiSessionRuns,
} from "../../lib/runtime/runs-api.js";
import type { EngentyAgUiMessage } from "../conversation.js";
import {
  type AppsAiThreadRecord,
  getAppsAiThread,
  listAppsAiThreadMessages,
} from "./apps-ai-thread-api.js";
import {
  attachAppsAiRunStream,
  postAppsAiThreadRun,
} from "./apps-ai-transport.js";
import { resetThreadLaneSnapshotCacheForTests } from "./thread-lane-snapshot-cache.js";
import { useEngentyAgUiAppsAiSession } from "./use-engenty-ag-ui-apps-ai-session.js";

vi.mock("../../lib/runtime/runs-api.js", () => ({
  cancelAiRun: vi.fn(async () => ({ summary: null })),
  getAiRunEvents: vi.fn(async () => ({ events: [], run_id: "run-1" })),
  getAiSessionRuns: vi.fn(async () => ({
    runs: [
      {
        id: "run-1",
        status: "running",
        agent_id: "engenty.copilot",
        thread_id: "thread-a",
        tenant_id: "tenant-1",
        // AFTER the fixture messages: rows persisted BEFORE the attached run
        // hydrate from the snapshot; rows the run itself persisted are
        // replay-owned and stream in via the attach instead.
        created_at: "2026-01-01T00:10:00.000Z",
        started_at: "2026-01-01T00:10:00.000Z",
        finished_at: null,
        action_id: null,
        error: null,
        request_id: null,
        summary: null,
        trigger: "message",
      },
    ],
  })),
}));

vi.mock("./apps-ai-thread-api.js", () => ({
  getAppsAiThread: vi.fn(async () => ({ status: "running" })),
  listAppsAiThreadMessages: vi.fn(async () => [
    {
      id: "user-1",
      role: "user",
      parts: [{ type: "text", text: "hello" }],
      created_at: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "assistant-1",
      role: "assistant",
      parts: [{ type: "text", text: "partial streamed reply" }],
      created_at: "2026-01-01T00:00:01.000Z",
    },
  ]),
}));

vi.mock("./apps-ai-transport.js", () => ({
  attachAppsAiRunStream: vi.fn(() => new Promise(() => {})), // hangs = live run
  createAppsAiThread: vi.fn(),
  postAppsAiFrontendToolRunResult: vi.fn(),
  postAppsAiThreadRun: vi.fn(),
}));

const routeContext = {
  moduleId: "engenty-copilot",
  pathname: "/mdl/engenty-copilot/chat/thread-a",
  routeKey: "chat",
};

function assistantText(message: EngentyAgUiMessage | undefined): string {
  if (!message) {
    return "";
  }
  if (typeof message.content === "string") {
    return message.content;
  }
  if (!Array.isArray(message.content)) {
    return "";
  }
  return message.content
    .flatMap((part) =>
      part &&
      typeof part === "object" &&
      "text" in part &&
      typeof part.text === "string"
        ? [part.text]
        : []
    )
    .join("");
}

function SessionProbe(props: {
  executeFrontendTool?: Parameters<
    typeof useEngentyAgUiAppsAiSession
  >[0]["executeFrontendTool"];
  frontendTools?: Parameters<
    typeof useEngentyAgUiAppsAiSession
  >[0]["frontendTools"];
  initialMessages?: readonly EngentyAgUiMessage[];
  onMessages: (messages: readonly EngentyAgUiMessage[]) => void;
  onPendingText?: (text: string | null) => void;
  onStatus: (status: string) => void;
  threadId: string | null;
}) {
  const session = useEngentyAgUiAppsAiSession({
    agentId: "engenty.copilot",
    executeFrontendTool: props.executeFrontendTool ?? (() => null),
    formatRequestError: (value) => value,
    formatTransportBlocker: (value) => value,
    frontendTools: props.frontendTools ?? [],
    initialMessages: props.initialMessages,
    isTransportReady: true,
    modelId: "openai/gpt-5-mini",
    pathname: routeContext.pathname,
    routeContext,
    serviceBaseUrl: "http://127.0.0.1:43110",
    threadId: props.threadId,
    transportBlocker: null,
  });
  props.onMessages(session.messages);
  props.onStatus(session.status);
  props.onPendingText?.(session.pendingSend?.text ?? null);
  return (
    <button onClick={() => session.submitMessage("hello")} type="button">
      send
    </button>
  );
}

describe("useAppsAiActiveRunRecovery", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    resetThreadLaneSnapshotCacheForTests();
  });

  it("hydrates partial assistant text from server polling without aborting on streaming status", async () => {
    const statuses: string[] = [];
    const snapshots: EngentyAgUiMessage[][] = [];

    render(
      <SessionProbe
        onMessages={(messages) => {
          snapshots.push([...messages]);
        }}
        onStatus={(status) => {
          statuses.push(status);
        }}
        threadId="thread-a"
      />
    );

    await waitFor(
      () => {
        const latest = snapshots.at(-1) ?? [];
        const assistant = latest.find(
          (message) => message.role === "assistant"
        );
        expect(assistant).toBeDefined();
        expect(assistantText(assistant)).toContain("partial streamed reply");
      },
      { timeout: 5000 }
    );

    expect(statuses).toContain("streaming");
  });

  it("purges replay-owned rows a reload hydrated into the lane", async () => {
    // Reload mid-run: hydration already placed the run's OWN partial flush in
    // the lane (DB id). The attach re-streams that content under the session
    // stream's different id — keeping both doubles the turn, so the recovery
    // loop must purge the DB copy before the replay starts.
    vi.mocked(listAppsAiThreadMessages).mockResolvedValue([
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "hello" }],
        created_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "assistant-current-turn",
        role: "assistant",
        parts: [{ type: "text", text: "partial flush" }],
        created_at: "2026-01-01T00:10:05.000Z",
      },
    ] as never);

    const snapshots: EngentyAgUiMessage[][] = [];
    render(
      <SessionProbe
        initialMessages={[
          {
            id: "user-1",
            role: "user",
            content: [{ type: "text", text: "hello" }],
            metadata: { created_at: "2026-01-01T00:00:00.000Z" },
          },
          {
            id: "assistant-current-turn",
            role: "assistant",
            content: "partial flush",
            metadata: { created_at: "2026-01-01T00:10:05.000Z" },
          },
        ]}
        onMessages={(messages) => {
          snapshots.push([...messages]);
        }}
        onStatus={() => {
          // not asserted here
        }}
        threadId="thread-a"
      />
    );

    await waitFor(
      () => {
        const latest = snapshots.at(-1) ?? [];
        expect(latest.map((message) => message.id)).toEqual(["user-1"]);
      },
      { timeout: 5000 }
    );
  });

  it("restores in-flight lane after sidebar thread switch during stream", async () => {
    let allowServerRecovery = false;

    vi.mocked(postAppsAiThreadRun).mockImplementation(
      ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener(
            "abort",
            () => {
              reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true }
          );
        })
    );
    vi.mocked(getAiSessionRuns).mockImplementation(async (threadId) => ({
      runs:
        allowServerRecovery && threadId === "thread-a"
          ? [
              {
                id: "run-1",
                status: "running",
                agent_id: "engenty.copilot",
                thread_id: "thread-a",
                tenant_id: "tenant-1",
                // AFTER the fixture messages (see the top-level mock note).
                created_at: "2026-01-01T00:10:00.000Z",
                started_at: "2026-01-01T00:10:00.000Z",
                finished_at: null,
                action_id: null,
                error: null,
                request_id: null,
                summary: null,
                trigger: "message",
              },
            ]
          : [],
    }));
    vi.mocked(getAppsAiThread).mockImplementation(async ({ threadId }) => {
      if (!(allowServerRecovery && threadId === "thread-a")) {
        return { status: "idle" } as AppsAiThreadRecord;
      }
      return { status: "running" } as AppsAiThreadRecord;
    });
    vi.mocked(listAppsAiThreadMessages).mockImplementation(
      async ({ threadId }) =>
        (allowServerRecovery && threadId === "thread-a"
          ? [
              {
                id: "user-1",
                role: "user",
                parts: [{ type: "text", text: "hello" }],
                created_at: "2026-01-01T00:00:00.000Z",
              },
              {
                id: "assistant-1",
                role: "assistant",
                parts: [{ type: "text", text: "partial streamed reply" }],
                created_at: "2026-01-01T00:00:01.000Z",
              },
            ]
          : []) as Awaited<ReturnType<typeof listAppsAiThreadMessages>>
    );

    const snapshots: EngentyAgUiMessage[][] = [];
    const statuses: string[] = [];
    const pendingTexts: Array<string | null> = [];

    const view = render(
      <SessionProbe
        onMessages={(messages) => {
          snapshots.push([...messages]);
        }}
        onPendingText={(text) => {
          pendingTexts.push(text);
        }}
        onStatus={(status) => {
          statuses.push(status);
        }}
        threadId="thread-a"
      />
    );

    view.getByRole("button", { name: "send" }).click();

    await waitFor(() => {
      const latest = snapshots.at(-1) ?? [];
      expect(latest.some((message) => message.role === "user")).toBe(true);
      expect(statuses).toContain("streaming");
    });

    view.rerender(
      <SessionProbe
        initialMessages={[
          {
            id: "other-user",
            role: "user",
            content: [{ type: "text", text: "other thread" }],
          },
        ]}
        onMessages={(messages) => {
          snapshots.push([...messages]);
        }}
        onPendingText={(text) => {
          pendingTexts.push(text);
        }}
        onStatus={(status) => {
          statuses.push(status);
        }}
        threadId="thread-b"
      />
    );

    await waitFor(() => {
      const latest = snapshots.at(-1) ?? [];
      expect(latest.map((message) => message.id)).toEqual(["other-user"]);
    });

    allowServerRecovery = true;

    view.rerender(
      <SessionProbe
        onMessages={(messages) => {
          snapshots.push([...messages]);
        }}
        onPendingText={(text) => {
          pendingTexts.push(text);
        }}
        onStatus={(status) => {
          statuses.push(status);
        }}
        threadId="thread-a"
      />
    );

    await waitFor(() => {
      const latest = snapshots.at(-1) ?? [];
      const user = latest.find((message) => message.role === "user");
      expect(user).toBeDefined();
      expect(assistantText(user)).toBe("hello");
      expect(statuses.at(-1)).toBe("streaming");
    });

    await waitFor(
      () => {
        expect(vi.mocked(getAiSessionRuns)).toHaveBeenCalledWith(
          "thread-a",
          expect.objectContaining({ limit: 20 })
        );
        expect(vi.mocked(listAppsAiThreadMessages)).toHaveBeenCalled();
      },
      { timeout: 5000 }
    );

    await waitFor(
      () => {
        const latest = snapshots.at(-1) ?? [];
        const assistant = latest.find(
          (message) => message.role === "assistant"
        );
        expect(assistantText(assistant)).toContain("partial streamed reply");
      },
      { timeout: 8000 }
    );

    expect(statuses).toContain("streaming");
    expect(
      pendingTexts.some((text) => text === "hello") ||
        snapshots
          .at(-1)
          ?.some(
            (message) =>
              message.role === "user" && assistantText(message) === "hello"
          )
    ).toBe(true);
  }, 10_000);

  it("attaches via SSE (attachAppsAiRunStream) when active run found on mount", async () => {
    render(
      <SessionProbe
        onMessages={() => {}}
        onStatus={() => {}}
        threadId="thread-a"
      />
    );

    await waitFor(
      () => {
        expect(vi.mocked(attachAppsAiRunStream)).toHaveBeenCalledWith(
          expect.objectContaining({ runId: "run-1", since: -1 })
        );
      },
      { timeout: 5000 }
    );
  });

  it("replays partial assistant text from run events when latest run is cancelled and DB has only user message", async () => {
    // Cancelled run: no in-flight run, DB transcript ends with user message only,
    // but run events contain partial text from before the coalescer was cut off.
    vi.mocked(getAiSessionRuns).mockResolvedValue({
      runs: [
        {
          id: "run-cancelled",
          status: "cancelled",
          agent_id: "engenty.copilot",
          thread_id: "thread-a",
          tenant_id: "tenant-1",
          created_at: "2026-01-01T00:00:00.000Z",
          started_at: "2026-01-01T00:00:00.000Z",
          finished_at: "2026-01-01T00:00:05.000Z",
          action_id: null,
          error: null,
          request_id: null,
          summary: null,
          trigger: "message",
        },
      ],
    });
    vi.mocked(getAppsAiThread).mockResolvedValue({
      status: "idle",
    } as AppsAiThreadRecord);
    // DB transcript only has user message (assistant never flushed)
    vi.mocked(listAppsAiThreadMessages).mockResolvedValue([
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "hello" }],
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ] as never);
    // Run events contain the partial text
    vi.mocked(getAiRunEvents).mockResolvedValue({
      run_id: "run-cancelled",
      events: [
        {
          id: "ev-1",
          run_id: "run-cancelled",
          seq: 0,
          level: null,
          message: null,
          created_at: "2026-01-01T00:00:01.000Z",
          event_type: "TEXT_MESSAGE_START",
          payload: { type: "TEXT_MESSAGE_START", messageId: "partial-msg" },
        },
        {
          id: "ev-2",
          run_id: "run-cancelled",
          seq: 1,
          level: null,
          message: null,
          created_at: "2026-01-01T00:00:02.000Z",
          event_type: "TEXT_MESSAGE_CONTENT",
          payload: {
            type: "TEXT_MESSAGE_CONTENT",
            messageId: "partial-msg",
            delta: "Partial ",
          },
        },
        {
          id: "ev-3",
          run_id: "run-cancelled",
          seq: 2,
          level: null,
          message: null,
          created_at: "2026-01-01T00:00:03.000Z",
          event_type: "TEXT_MESSAGE_CONTENT",
          payload: {
            type: "TEXT_MESSAGE_CONTENT",
            messageId: "partial-msg",
            delta: "reply",
          },
        },
      ],
    });

    const snapshots: EngentyAgUiMessage[][] = [];

    render(
      <SessionProbe
        onMessages={(messages) => {
          snapshots.push([...messages]);
        }}
        onStatus={() => {}}
        threadId="thread-a"
      />
    );

    await waitFor(
      () => {
        const latest = snapshots.at(-1) ?? [];
        const assistant = latest.find((m) => m.role === "assistant");
        expect(assistant).toBeDefined();
        expect(assistantText(assistant)).toContain("Partial reply");
      },
      { timeout: 5000 }
    );

    // Should not have tried to attach SSE (run is terminal)
    expect(vi.mocked(attachAppsAiRunStream)).not.toHaveBeenCalled();
  });

  it("cancel() calls cancelAiRun with the active run id", async () => {
    vi.mocked(getAiSessionRuns).mockResolvedValue({ runs: [] }); // no recovery
    vi.mocked(postAppsAiThreadRun).mockImplementation(
      ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError"))
          );
        })
    );

    let cancelFn: (() => void) | null = null;
    const statuses: string[] = [];

    function CancelProbe(props: { threadId: string | null }) {
      const session = useEngentyAgUiAppsAiSession({
        agentId: "engenty.copilot",
        executeFrontendTool: () => null,
        formatRequestError: (v) => v,
        formatTransportBlocker: (v) => v,
        frontendTools: [],
        isTransportReady: true,
        modelId: "openai/gpt-5-mini",
        pathname: "/chat",
        routeContext: {
          moduleId: "engenty-copilot",
          pathname: "/chat",
          routeKey: "chat",
        },
        serviceBaseUrl: "http://127.0.0.1:43110",
        threadId: props.threadId,
        transportBlocker: null,
      });
      cancelFn = session.cancel;
      statuses.push(session.status);
      return (
        <>
          <button onClick={() => session.submitMessage("hello")} type="button">
            send
          </button>
          <button onClick={() => session.cancel()} type="button">
            cancel
          </button>
        </>
      );
    }

    const view = render(<CancelProbe threadId="thread-a" />);
    view.getByRole("button", { name: "send" }).click();
    await waitFor(() => expect(statuses).toContain("streaming"));

    view.getByRole("button", { name: "cancel" }).click();

    await waitFor(
      () => {
        expect(vi.mocked(cancelAiRun)).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ reason: "user_cancel" })
        );
      },
      { timeout: 3000 }
    );

    void cancelFn;
  });
});
