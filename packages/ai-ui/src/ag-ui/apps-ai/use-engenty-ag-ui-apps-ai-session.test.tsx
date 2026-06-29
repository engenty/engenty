/** @vitest-environment happy-dom */
import { EventType } from "@engenty/ag-ui-bridge";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EngentyAgUiMessage } from "../conversation.js";
import { postAppsAiThreadRun } from "./apps-ai-transport.js";
import {
  shouldPreserveTranscriptOnBoundSessionIdChange,
  shouldSkipBoundSessionReset,
  shouldSkipStaleMessagesSnapshotDuringRun,
  useEngentyAgUiAppsAiSession,
} from "./use-engenty-ag-ui-apps-ai-session.js";

const CREATED_SESSION_ID = "1eeb6096-06e8-4f80-9869-27f581d9fcb9";

vi.mock("./apps-ai-transport.js", () => ({
  attachAppsAiRunStream: vi.fn(() => new Promise(() => {})),
  createAppsAiThread: vi.fn(async () => ({
    id: CREATED_SESSION_ID,
    agent_id: "engenty.copilot",
    title: "hi",
  })),
  postAppsAiThreadRun: vi.fn(
    async (params: {
      onEvent: (event: {
        messages: EngentyAgUiMessage[];
        type: string;
      }) => void;
    }) => {
      params.onEvent({
        type: EventType.MESSAGES_SNAPSHOT,
        messages: [
          {
            id: "server-user",
            role: "user",
            content: [{ type: "text", text: "hi" }],
          },
        ],
      });
    }
  ),
  postAppsAiFrontendToolRunResult: vi.fn(),
}));

vi.mock("../../lib/runtime/runs-api.js", () => ({
  cancelAiRun: vi.fn(async () => ({ summary: null })),
  getAiSessionRuns: vi.fn(async () => ({ runs: [] })),
}));

const routeContext = {
  moduleId: "engenty-copilot",
  pathname: "/mdl/engenty-copilot/chat/session-a",
  routeKey: "chat",
};

function message(id: string, text: string): EngentyAgUiMessage {
  return {
    id,
    role: "user",
    content: [{ type: "text", text }],
  };
}

function messageText(message: EngentyAgUiMessage): string {
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
      "type" in part &&
      part.type === "text" &&
      "text" in part &&
      typeof part.text === "string"
        ? [part.text]
        : []
    )
    .join("");
}

function SessionProbe(props: {
  hydrateEnabled?: boolean;
  initialMessages: readonly EngentyAgUiMessage[];
  onMessages: (messages: readonly EngentyAgUiMessage[]) => void;
  threadId: string | null;
}) {
  const session = useEngentyAgUiAppsAiSession({
    agentId: "engenty.copilot",
    executeFrontendTool: () => null,
    formatRequestError: (value) => value,
    formatTransportBlocker: (value) => value,
    frontendTools: [],
    initialMessages: props.initialMessages,
    isTransportReady: true,
    modelId: "openai/gpt-5-mini",
    pathname: routeContext.pathname,
    routeContext,
    serviceBaseUrl: "http://127.0.0.1:43110",
    threadId: props.threadId,
    transportBlocker: null,
    hydrateEnabled: props.hydrateEnabled,
  });
  props.onMessages(session.messages);
  return null;
}

const OTHER_SESSION_ID = "660e8400-e29b-41d4-a716-446655440001";

describe("shouldSkipBoundSessionReset", () => {
  it("skips reset when the URL still names the thread during transient unbind", () => {
    expect(
      shouldSkipBoundSessionReset({
        authoritativeUrlThreadId: CREATED_SESSION_ID,
        nextBoundSessionId: null,
        previousBoundSessionId: CREATED_SESSION_ID,
        runtimeSessionId: null,
      })
    ).toBe(true);

    expect(
      shouldSkipBoundSessionReset({
        authoritativeUrlThreadId: CREATED_SESSION_ID,
        nextBoundSessionId: null,
        previousBoundSessionId: null,
        runtimeSessionId: null,
      })
    ).toBe(false);
  });

  it("skips reset when an unbound lane binds to the URL session", () => {
    expect(
      shouldSkipBoundSessionReset({
        authoritativeUrlThreadId: CREATED_SESSION_ID,
        nextBoundSessionId: CREATED_SESSION_ID,
        previousBoundSessionId: null,
        runtimeSessionId: null,
      })
    ).toBe(true);
  });

  it("resets when the URL names a different session than the previously bound id", () => {
    expect(
      shouldSkipBoundSessionReset({
        authoritativeUrlThreadId: CREATED_SESSION_ID,
        nextBoundSessionId: CREATED_SESSION_ID,
        previousBoundSessionId: OTHER_SESSION_ID,
        runtimeSessionId: null,
      })
    ).toBe(false);
  });

  it("resets when the bound id changes away from the URL session", () => {
    expect(
      shouldSkipBoundSessionReset({
        authoritativeUrlThreadId: CREATED_SESSION_ID,
        nextBoundSessionId: OTHER_SESSION_ID,
        previousBoundSessionId: CREATED_SESSION_ID,
        runtimeSessionId: null,
      })
    ).toBe(false);
  });
});

describe("shouldPreserveTranscriptOnBoundSessionIdChange", () => {
  it("is true only when URL binds to the runtime id from /new first-send", () => {
    expect(
      shouldPreserveTranscriptOnBoundSessionIdChange({
        previousBoundSessionId: null,
        nextBoundSessionId: CREATED_SESSION_ID,
        runtimeSessionId: CREATED_SESSION_ID,
      })
    ).toBe(true);

    expect(
      shouldPreserveTranscriptOnBoundSessionIdChange({
        previousBoundSessionId: null,
        nextBoundSessionId: CREATED_SESSION_ID,
        runtimeSessionId: "660e8400-e29b-41d4-a716-446655440001",
      })
    ).toBe(false);

    expect(
      shouldPreserveTranscriptOnBoundSessionIdChange({
        previousBoundSessionId: "660e8400-e29b-41d4-a716-446655440001",
        nextBoundSessionId: CREATED_SESSION_ID,
        runtimeSessionId: CREATED_SESSION_ID,
      })
    ).toBe(false);
  });
});

describe("shouldSkipStaleMessagesSnapshotDuringRun", () => {
  it("skips snapshots that drop a live requestDecision tool row", () => {
    expect(
      shouldSkipStaleMessagesSnapshotDuringRun({
        inFlight: true,
        liveMessages: [
          {
            id: "user-1",
            role: "user",
            content: [{ type: "text", text: "pick a color" }],
          },
          {
            id: "tool-decision",
            role: "tool",
            toolCallId: "decision-1",
            content: JSON.stringify({
              type: "dynamic-tool",
              toolName: "requestDecision",
              output: {
                artifact_id: "artifact-1",
                artifact_type: "decision",
                choices: [{ id: "red", label: "Rot" }],
                title: "Farbauswahl",
              },
            }),
          },
        ],
        snapshotMessages: [
          {
            id: "user-1",
            role: "user",
            content: [{ type: "text", text: "pick a color" }],
          },
          {
            id: "assistant-1",
            role: "assistant",
            content: "Choose one",
          },
        ],
      })
    ).toBe(true);
  });
});

describe("useEngentyAgUiAppsAiSession", () => {
  afterEach(() => {
    cleanup();
  });

  it("keeps the submitted user message before immediately streamed assistant text", async () => {
    vi.mocked(postAppsAiThreadRun).mockImplementationOnce(async (params) => {
      params.onEvent({
        type: EventType.TEXT_MESSAGE_START,
        messageId: "assistant-1",
        role: "assistant",
      } as never);
      params.onEvent({
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: "assistant-1",
        delta: "hello back",
      } as never);
      params.onEvent({
        type: EventType.RUN_FINISHED,
        runId: "run-1",
        threadId: CREATED_SESSION_ID,
      } as never);
    });
    const snapshots: EngentyAgUiMessage[][] = [];

    function Harness() {
      const session = useEngentyAgUiAppsAiSession({
        agentId: "engenty.copilot",
        executeFrontendTool: () => null,
        formatRequestError: (value) => value,
        formatTransportBlocker: (value) => value,
        frontendTools: [],
        initialMessages: undefined,
        isTransportReady: true,
        modelId: "openai/gpt-5-mini",
        pathname: "/mdl/engenty-copilot/chat/new",
        routeContext,
        serviceBaseUrl: "http://127.0.0.1:43110",
        threadId: null,
        transportBlocker: null,
      });
      snapshots.push([...session.messages]);
      return (
        <button onClick={() => session.submitMessage("hi")} type="button">
          send
        </button>
      );
    }

    const view = render(<Harness />);
    view.getByRole("button", { name: "send" }).click();

    await waitFor(() =>
      expect(snapshots.at(-1)?.map((item) => item.role)).toEqual([
        "user",
        "assistant",
      ])
    );
    expect(snapshots.at(-1)?.map(messageText)).toEqual(["hi", "hello back"]);
  });

  it("invalidates a module's query root when its agent write tool resolves", async () => {
    vi.mocked(postAppsAiThreadRun).mockImplementationOnce(async (params) => {
      params.onEvent({
        type: EventType.TOOL_CALL_START,
        messageId: "assistant-1",
        toolCallId: "tc-1",
        toolCallName: "manage_project",
      } as never);
      params.onEvent({
        type: EventType.TOOL_CALL_RESULT,
        messageId: "tool-1",
        toolCallId: "tc-1",
        content: '{"id":"p-1"}',
      } as never);
      params.onEvent({
        type: EventType.RUN_FINISHED,
        runId: "run-1",
        threadId: CREATED_SESSION_ID,
      } as never);
    });

    const invalidateQueries = vi.fn();
    const queryClient = { invalidateQueries, setQueryData: vi.fn() };

    function Harness() {
      const session = useEngentyAgUiAppsAiSession({
        agentId: "engenty.copilot",
        agentToolInvalidation: new Map([["manage_project", [["projects"]]]]),
        executeFrontendTool: () => null,
        formatRequestError: (value) => value,
        formatTransportBlocker: (value) => value,
        frontendTools: [],
        initialMessages: undefined,
        isTransportReady: true,
        modelId: "openai/gpt-5-mini",
        pathname: "/mdl/engenty-copilot/chat/new",
        queryClient: queryClient as never,
        routeContext,
        serviceBaseUrl: "http://127.0.0.1:43110",
        threadId: null,
        transportBlocker: null,
      });
      return (
        <button onClick={() => session.submitMessage("hi")} type="button">
          send
        </button>
      );
    }

    const view = render(<Harness />);
    view.getByRole("button", { name: "send" }).click();

    await waitFor(() =>
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["projects"] })
    );
  });

  it("does not invalidate for tool ids absent from the map", async () => {
    vi.mocked(postAppsAiThreadRun).mockImplementationOnce(async (params) => {
      params.onEvent({
        type: EventType.TOOL_CALL_START,
        messageId: "assistant-1",
        toolCallId: "tc-9",
        toolCallName: "load_projects_list",
      } as never);
      params.onEvent({
        type: EventType.TOOL_CALL_RESULT,
        messageId: "tool-9",
        toolCallId: "tc-9",
        content: "[]",
      } as never);
      params.onEvent({
        type: EventType.RUN_FINISHED,
        runId: "run-9",
        threadId: CREATED_SESSION_ID,
      } as never);
    });

    const invalidateQueries = vi.fn();
    const queryClient = { invalidateQueries, setQueryData: vi.fn() };

    function Harness() {
      const session = useEngentyAgUiAppsAiSession({
        agentId: "engenty.copilot",
        agentToolInvalidation: new Map([["manage_project", [["projects"]]]]),
        executeFrontendTool: () => null,
        formatRequestError: (value) => value,
        formatTransportBlocker: (value) => value,
        frontendTools: [],
        initialMessages: undefined,
        isTransportReady: true,
        modelId: "openai/gpt-5-mini",
        pathname: "/mdl/engenty-copilot/chat/new",
        queryClient: queryClient as never,
        routeContext,
        serviceBaseUrl: "http://127.0.0.1:43110",
        threadId: null,
        transportBlocker: null,
      });
      return (
        <button onClick={() => session.submitMessage("hi")} type="button">
          send
        </button>
      );
    }

    const view = render(<Harness />);
    view.getByRole("button", { name: "send" }).click();

    await waitFor(() => expect(invalidateQueries).toHaveBeenCalled());
    expect(invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: ["projects"],
    });
  });

  it("keeps transcript when bound threadId flickers null while URL still names the thread", async () => {
    const snapshots: EngentyAgUiMessage[][] = [];

    function Harness({
      authoritativeUrlThreadId,
      threadId,
    }: {
      authoritativeUrlThreadId: string | null;
      threadId: string | null;
    }) {
      const session = useEngentyAgUiAppsAiSession({
        agentId: "engenty.copilot",
        authoritativeUrlThreadId,
        executeFrontendTool: () => null,
        formatRequestError: (value) => value,
        formatTransportBlocker: (value) => value,
        frontendTools: [],
        initialMessages: [message("seed-user", "hello from server")],
        isTransportReady: true,
        modelId: "openai/gpt-5-mini",
        pathname: `/mdl/engenty-copilot/chat/${CREATED_SESSION_ID}`,
        routeContext,
        serviceBaseUrl: "http://127.0.0.1:43110",
        threadId,
        transportBlocker: null,
      });
      snapshots.push([...session.messages]);
      return null;
    }

    const view = render(
      <Harness
        authoritativeUrlThreadId={CREATED_SESSION_ID}
        threadId={CREATED_SESSION_ID}
      />
    );

    await waitFor(() =>
      expect(snapshots.at(-1)?.map((item) => item.id)).toEqual(["seed-user"])
    );

    view.rerender(
      <Harness authoritativeUrlThreadId={CREATED_SESSION_ID} threadId={null} />
    );

    await waitFor(() => expect(snapshots.length).toBeGreaterThan(1));
    expect(snapshots.at(-1)?.map((item) => item.id)).toEqual(["seed-user"]);

    view.rerender(
      <Harness
        authoritativeUrlThreadId={CREATED_SESSION_ID}
        threadId={CREATED_SESSION_ID}
      />
    );

    expect(snapshots.at(-1)?.map((item) => item.id)).toEqual(["seed-user"]);
  });

  it("keeps the first-send transcript when bound threadId catches up after /new", async () => {
    const snapshots: EngentyAgUiMessage[][] = [];

    function Harness({ threadId }: { threadId: string | null }) {
      const session = useEngentyAgUiAppsAiSession({
        agentId: "engenty.copilot",
        executeFrontendTool: () => null,
        formatRequestError: (value) => value,
        formatTransportBlocker: (value) => value,
        frontendTools: [],
        initialMessages: undefined,
        isTransportReady: true,
        modelId: "openai/gpt-5-mini",
        onThreadCreated: () => {},
        pathname: "/mdl/engenty-copilot/chat/new",
        routeContext,
        serviceBaseUrl: "http://127.0.0.1:43110",
        threadId,
        transportBlocker: null,
      });

      snapshots.push([...session.messages]);

      return (
        <button onClick={() => session.submitMessage("hi")} type="button">
          send
        </button>
      );
    }

    const view = render(<Harness threadId={null} />);
    view.getByRole("button", { name: "send" }).click();

    await waitFor(() =>
      expect(snapshots.at(-1)?.map((item) => item.id)).toEqual(["server-user"])
    );

    view.rerender(<Harness threadId={CREATED_SESSION_ID} />);

    await waitFor(() =>
      expect(snapshots.at(-1)?.map((item) => item.id)).toEqual(["server-user"])
    );
  });

  it("surfaces SSE run errors instead of returning to ready empty state", async () => {
    vi.mocked(postAppsAiThreadRun).mockImplementationOnce(async (params) => {
      params.onEvent({
        type: EventType.RUN_ERROR,
        message: "agent_sessions.runFailed",
        runId: "run-1",
      } as never);
    });
    const states: Array<{ error: string | null; status: string }> = [];

    function Harness() {
      const session = useEngentyAgUiAppsAiSession({
        agentId: "engenty.copilot",
        executeFrontendTool: () => null,
        formatRequestError: (value) => `formatted:${value}`,
        formatTransportBlocker: (value) => value,
        frontendTools: [],
        initialMessages: undefined,
        isTransportReady: true,
        modelId: "openai/gpt-5-mini",
        pathname: "/mdl/engenty-copilot/chat/new",
        routeContext,
        serviceBaseUrl: "http://127.0.0.1:43110",
        threadId: CREATED_SESSION_ID,
        transportBlocker: null,
      });
      states.push({
        error: session.error?.message ?? null,
        status: session.status,
      });
      return (
        <button onClick={() => session.submitMessage("hi")} type="button">
          send
        </button>
      );
    }

    const view = render(<Harness />);
    view.getByRole("button", { name: "send" }).click();

    await waitFor(() =>
      expect(states.at(-1)).toEqual({
        error:
          "formatted:The assistant run failed. Try again or start a new chat.",
        status: "error",
      })
    );
  });

  it("resets and hydrates when the URL session replaces a different bound session", async () => {
    const snapshots: EngentyAgUiMessage[][] = [];

    function Harness({
      authoritativeUrlThreadId,
      initialMessages,
      threadId,
    }: {
      authoritativeUrlThreadId: string;
      initialMessages: readonly EngentyAgUiMessage[];
      threadId: string;
    }) {
      const session = useEngentyAgUiAppsAiSession({
        agentId: "engenty.copilot",
        authoritativeUrlThreadId,
        executeFrontendTool: () => null,
        formatRequestError: (value) => value,
        formatTransportBlocker: (value) => value,
        frontendTools: [],
        initialMessages,
        isTransportReady: true,
        modelId: "openai/gpt-5-mini",
        pathname: `/mdl/engenty-copilot/chat/${authoritativeUrlThreadId}`,
        routeContext,
        serviceBaseUrl: "http://127.0.0.1:43110",
        threadId,
        transportBlocker: null,
      });
      snapshots.push([...session.messages]);
      return null;
    }

    const view = render(
      <Harness
        authoritativeUrlThreadId={OTHER_SESSION_ID}
        initialMessages={[message("other-user", "other thread")]}
        threadId={OTHER_SESSION_ID}
      />
    );

    await waitFor(() =>
      expect(snapshots.at(-1)?.map((item) => item.id)).toEqual(["other-user"])
    );

    view.rerender(
      <Harness
        authoritativeUrlThreadId={CREATED_SESSION_ID}
        initialMessages={[message("url-user", "url thread")]}
        threadId={CREATED_SESSION_ID}
      />
    );

    await waitFor(() =>
      expect(snapshots.at(-1)?.map((item) => item.id)).toEqual(["url-user"])
    );
  });

  it("hydrates clicked route sessions after clearing the previous session", async () => {
    const snapshots: EngentyAgUiMessage[][] = [];
    const onMessages = (messages: readonly EngentyAgUiMessage[]) => {
      snapshots.push([...messages]);
    };

    const view = render(
      <SessionProbe
        initialMessages={[message("session-a-user", "first session")]}
        onMessages={onMessages}
        threadId="session-a"
      />
    );

    await waitFor(() =>
      expect(snapshots.at(-1)?.map((item) => item.id)).toEqual([
        "session-a-user",
      ])
    );

    view.rerender(
      <SessionProbe
        initialMessages={[message("session-b-user", "clicked session")]}
        onMessages={onMessages}
        threadId="session-b"
      />
    );

    await waitFor(() =>
      expect(snapshots.at(-1)?.map((item) => item.id)).toEqual([
        "session-b-user",
      ])
    );
  });

  it("skips TanStack hydrate when hydrateEnabled is false", async () => {
    const snapshots: EngentyAgUiMessage[][] = [];
    const onMessages = (messages: readonly EngentyAgUiMessage[]) => {
      snapshots.push([...messages]);
    };

    render(
      <SessionProbe
        hydrateEnabled={false}
        initialMessages={[message("stale-user", "should not appear")]}
        onMessages={onMessages}
        threadId="session-a"
      />
    );

    await waitFor(() => expect(snapshots.length).toBeGreaterThan(0));
    expect(snapshots.at(-1)).toEqual([]);
  });

  it("keeps reset callback stable across rerenders", () => {
    const resetCallbacks: Array<() => void> = [];

    function ResetProbe({ tick }: { tick: number }) {
      void tick;
      const session = useEngentyAgUiAppsAiSession({
        agentId: "tasks.assist",
        executeFrontendTool: () => null,
        formatRequestError: (value) => value,
        formatTransportBlocker: (value) => value,
        frontendTools: [],
        initialMessages: undefined,
        isTransportReady: true,
        modelId: "openai/gpt-5-mini",
        pathname: "/mdl/tasks/task-1",
        routeContext: {
          moduleId: "tasks",
          pathname: "/mdl/tasks/task-1",
          routeKey: "detail",
          scope: { task_id: "task-1" },
        },
        serviceBaseUrl: "http://127.0.0.1:43110",
        threadId: null,
        transportBlocker: null,
      });
      resetCallbacks.push(session.reset);
      return null;
    }

    const view = render(<ResetProbe tick={0} />);
    view.rerender(<ResetProbe tick={1} />);
    view.rerender(<ResetProbe tick={2} />);

    expect(new Set(resetCallbacks).size).toBe(1);
  });
});
