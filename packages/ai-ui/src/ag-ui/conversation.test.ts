import { buildAgUiMessagesFromSessionMessages } from "@engenty/ai-core/browser";
import { describe, expect, it } from "vitest";
import {
  applyEngentyAgUiConversationAction,
  areAgUiHydrationTargetsEqual,
  createAgUiHydrationSignature,
  type EngentyAgUiConversationState,
  isAwaitingAgUiInitialHydrate,
  reduceEngentyAgUiConversationEvent,
  shouldRefuseStaleAgUiHydration,
  shouldSeedAgUiConversationFromInitialMessages,
} from "./conversation.js";
import { agUiMessagesToCopilotMessages } from "./copilot-adapter.js";
import { normalizeDynamicToolDisplay } from "./normalize-dynamic-tool-part.js";

function withNormalizedToolDisplay(part: Record<string, unknown>) {
  const normalized = normalizeDynamicToolDisplay({
    toolName: String(part.toolName ?? "tool"),
    input: part.input,
    output: part.output,
  });
  return {
    ...part,
    displayLabel: normalized.displayLabel,
    resolvedToolName: normalized.resolvedToolName,
    ...(normalized.metadata ? { metadata: normalized.metadata } : {}),
  };
}

function emptyState(): EngentyAgUiConversationState {
  return {
    activeTextMessageId: null,
    events: [],
    messages: [],
    state: {},
    status: "idle",
  };
}

describe("AG-UI conversation shared state (Ch.6)", () => {
  it("merges `shared` across STATE_SNAPSHOTs (no state loss), replaces the rest", () => {
    let state = emptyState();
    // Agent/app publishes shared.plan + shared.filter via a first snapshot.
    state = reduceEngentyAgUiConversationEvent(state, {
      type: "STATE_SNAPSHOT",
      snapshot: {
        route: { pathname: "/a" },
        shared: { plan: "A", filter: "x" },
      },
    } as never);
    // A later app snapshot carries only shared.filter (no plan) + a new route.
    state = reduceEngentyAgUiConversationEvent(state, {
      type: "STATE_SNAPSHOT",
      snapshot: { route: { pathname: "/b" }, shared: { filter: "y" } },
    } as never);

    const merged = state.state as {
      route?: { pathname?: string };
      shared?: Record<string, unknown>;
    };
    // `shared` merged: plan preserved, filter overlaid.
    expect(merged.shared).toEqual({ plan: "A", filter: "y" });
    // Non-shared fields still replace (route is authoritative from the host).
    expect(merged.route?.pathname).toBe("/b");
  });

  it("applies STATE_DELTA to /shared (agent publish path)", () => {
    let state = emptyState();
    state = reduceEngentyAgUiConversationEvent(state, {
      type: "STATE_SNAPSHOT",
      snapshot: { shared: { plan: "A" } },
    } as never);
    state = reduceEngentyAgUiConversationEvent(state, {
      type: "STATE_DELTA",
      delta: [{ op: "replace", path: "/shared/plan", value: "B" }],
    } as never);

    expect(
      (state.state as { shared?: Record<string, unknown> }).shared
    ).toEqual({
      plan: "B",
    });
  });
});

describe("AG-UI conversation reducer", () => {
  it("streams text into official AG-UI messages", () => {
    let state = emptyState();
    state = reduceEngentyAgUiConversationEvent(state, {
      type: "RUN_STARTED",
      runId: "run-1",
    });
    state = reduceEngentyAgUiConversationEvent(state, {
      type: "TEXT_MESSAGE_START",
      messageId: "assistant-1",
      role: "assistant",
    });
    state = reduceEngentyAgUiConversationEvent(state, {
      type: "TEXT_MESSAGE_CONTENT",
      messageId: "assistant-1",
      delta: "Hel",
    });
    state = reduceEngentyAgUiConversationEvent(state, {
      type: "TEXT_MESSAGE_CONTENT",
      messageId: "assistant-1",
      delta: "lo",
    });

    expect(state.status).toBe("running");
    expect(state.messages).toEqual([
      { id: "assistant-1", role: "assistant", content: "Hello" },
    ]);
  });

  it("replaces optimistic messages with authoritative snapshots", () => {
    const state = reduceEngentyAgUiConversationEvent(
      {
        ...emptyState(),
        messages: [{ id: "client-1", role: "user", content: "Hello" }],
      },
      {
        type: "MESSAGES_SNAPSHOT",
        messages: [{ id: "server-1", role: "user", content: "Hello" }],
      }
    );

    expect(state.messages).toEqual([
      { id: "server-1", role: "user", content: "Hello" },
    ]);
    expect(state.messages).toHaveLength(1);
  });

  it("keeps two user rows with identical text in a snapshot", () => {
    const state = reduceEngentyAgUiConversationEvent(emptyState(), {
      type: "MESSAGES_SNAPSHOT",
      messages: [
        { id: "user-1", role: "user", content: "hi" },
        { id: "user-2", role: "user", content: "hi" },
      ],
    });

    expect(state.messages).toHaveLength(2);
    expect(state.messages.map((message) => message.id)).toEqual([
      "user-1",
      "user-2",
    ]);
  });

  it("hydrate replaces messages without merging", () => {
    const state = applyEngentyAgUiConversationAction(
      {
        ...emptyState(),
        messages: [{ id: "client-1", role: "user", content: "hi" }],
      },
      {
        type: "hydrate",
        messages: [{ id: "server-1", role: "user", content: "hi" }],
      }
    );

    expect(state.messages).toEqual([
      { id: "server-1", role: "user", content: "hi" },
    ]);
  });

  it("append_user_message replaces by id only, not by text", () => {
    let state = applyEngentyAgUiConversationAction(emptyState(), {
      type: "append_user_message",
      message: { id: "user-1", role: "user", content: "hi" },
    });
    state = applyEngentyAgUiConversationAction(state, {
      type: "append_user_message",
      message: { id: "user-2", role: "user", content: "hi" },
    });

    expect(state.messages).toHaveLength(2);
    expect(state.messages.map((message) => message.id)).toEqual([
      "user-1",
      "user-2",
    ]);
  });

  it("applies state snapshots and JSON deltas", () => {
    let state = reduceEngentyAgUiConversationEvent(emptyState(), {
      type: "STATE_SNAPSHOT",
      snapshot: { route: { pathname: "/mdl/engenty-copilot" }, sequence: 1 },
    });
    state = reduceEngentyAgUiConversationEvent(state, {
      type: "STATE_DELTA",
      delta: [
        { op: "replace", path: "/route/pathname", value: "/mdl/contacts" },
        { op: "add", path: "/route/route_key", value: "detail" },
      ],
    });

    expect(state.state).toEqual({
      route: { pathname: "/mdl/contacts", route_key: "detail" },
      sequence: 1,
    });
  });

  it("adapts AG-UI messages at the legacy Copilot render boundary", () => {
    expect(
      agUiMessagesToCopilotMessages([
        { id: "user-1", role: "user", content: "Hi" },
        { id: "assistant-1", role: "assistant", content: "Hello" },
      ])
    ).toEqual([
      { id: "user-1", role: "user", parts: [{ type: "text", text: "Hi" }] },
      {
        id: "assistant-1",
        role: "assistant",
        parts: [{ type: "text", text: "Hello" }],
      },
    ]);
  });

  it("renders orphan tool results in transcript order", () => {
    expect(
      agUiMessagesToCopilotMessages([
        { id: "assistant-1", role: "assistant", content: "Working…" },
        {
          id: "tool-result-1",
          role: "tool",
          toolCallId: "tool-orphan",
          content: JSON.stringify({
            type: "dynamic-tool",
            toolCallId: "tool-orphan",
            toolName: "engenty_tool_execute",
            state: "output-available",
            input: { contractId: "contacts_list" },
            output: { ok: true },
          }),
        },
      ])
    ).toEqual([
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          { type: "text", text: "Working…" },
          withNormalizedToolDisplay({
            type: "dynamic-tool",
            toolCallId: "tool-orphan",
            toolName: "engenty_tool_execute",
            state: "output-available",
            input: { contractId: "contacts_list" },
            output: { ok: true },
          }),
        ],
      },
    ]);
  });

  it("does not attach orphan tool results to a later assistant turn", () => {
    expect(
      agUiMessagesToCopilotMessages([
        {
          id: "assistant-theme",
          role: "assistant",
          content: "Dark Mode ist jetzt aktiviert.",
        },
        {
          id: "user-search",
          role: "user",
          content: "suche nach anwälten",
        },
        {
          id: "tool-result-theme",
          role: "tool",
          toolCallId: "frontend-theme",
          content: JSON.stringify({
            type: "dynamic-tool",
            toolCallId: "frontend-theme",
            toolName: "invoke_frontend_tool",
            state: "output-available",
            input: { name: "shell_set_theme" },
            output: { ok: true },
          }),
        },
        {
          id: "tool-result-search",
          role: "tool",
          toolCallId: "backend-search",
          content: JSON.stringify({
            type: "dynamic-tool",
            toolCallId: "backend-search",
            toolName: "engenty_tools_search",
            state: "output-available",
            input: { query: "anwälten" },
            output: { matches: [] },
          }),
        },
        {
          id: "assistant-search",
          role: "assistant",
          content: "Ich habe noch keinen passenden Tool-Treffer gefunden.",
        },
      ])
    ).toEqual([
      {
        id: "assistant-theme",
        role: "assistant",
        parts: [{ type: "text", text: "Dark Mode ist jetzt aktiviert." }],
      },
      {
        id: "user-search",
        role: "user",
        parts: [{ type: "text", text: "suche nach anwälten" }],
      },
      {
        id: "orphan-tools-tool-result-theme",
        role: "assistant",
        parts: [
          withNormalizedToolDisplay({
            type: "dynamic-tool",
            toolCallId: "frontend-theme",
            toolName: "invoke_frontend_tool",
            state: "output-available",
            input: { name: "shell_set_theme" },
            output: { ok: true },
          }),
          withNormalizedToolDisplay({
            type: "dynamic-tool",
            toolCallId: "backend-search",
            toolName: "engenty_tools_search",
            state: "output-available",
            input: { query: "anwälten" },
            output: { matches: [] },
          }),
        ],
      },
      {
        id: "assistant-search",
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "Ich habe noch keinen passenden Tool-Treffer gefunden.",
          },
        ],
      },
    ]);
  });

  it("renders assistant tool cards before reply text during streaming", () => {
    expect(
      agUiMessagesToCopilotMessages([
        {
          id: "assistant-1",
          role: "assistant",
          content: "Hier sind passende Förderungen.",
          toolCalls: [
            {
              id: "tool-1",
              type: "function",
              function: {
                name: "engenty_tools_search",
                arguments: '{"query":"Förderungen"}',
              },
            },
            {
              id: "tool-2",
              type: "function",
              function: {
                name: "engenty_tools_discover",
                arguments: "{}",
              },
            },
          ],
        },
        {
          id: "tool-result-1",
          role: "tool",
          toolCallId: "tool-1",
          content: JSON.stringify({
            type: "dynamic-tool",
            toolCallId: "tool-1",
            toolName: "engenty_tools_search",
            state: "output-available",
            output: { ok: true },
          }),
        },
        {
          id: "tool-result-2",
          role: "tool",
          toolCallId: "tool-2",
          content: JSON.stringify({
            type: "dynamic-tool",
            toolCallId: "tool-2",
            toolName: "engenty_tools_discover",
            state: "output-available",
            output: { ok: true },
          }),
        },
      ])
    ).toEqual([
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          withNormalizedToolDisplay({
            type: "dynamic-tool",
            toolCallId: "tool-1",
            toolName: "engenty_tools_search",
            state: "output-available",
            input: { query: "Förderungen" },
            output: { ok: true },
          }),
          withNormalizedToolDisplay({
            type: "dynamic-tool",
            toolCallId: "tool-2",
            toolName: "engenty_tools_discover",
            state: "output-available",
            input: {},
            output: { ok: true },
          }),
          { type: "text", text: "Hier sind passende Förderungen." },
        ],
      },
    ]);
  });

  it("sorts hydrated AG-UI rows before rendering copilot transcript", () => {
    expect(
      agUiMessagesToCopilotMessages([
        {
          id: "assistant-theme",
          role: "assistant",
          metadata: { created_at: "2026-05-21T12:00:01.000Z" },
          content: "",
          toolCalls: [
            {
              id: "theme-tool",
              type: "function",
              function: {
                name: "invoke_frontend_tool",
                arguments: '{"name":"shell_set_theme"}',
              },
            },
          ],
        },
        {
          id: "user-pick",
          role: "user",
          metadata: { created_at: "2026-05-21T12:00:00.000Z" },
          content: "Lass mich aus 10 farben wählen",
        },
      ]).map((message) => message.role)
    ).toEqual(["user", "assistant"]);
  });

  it("merges live assistant content string ahead of persisted transcript_parts", () => {
    expect(
      agUiMessagesToCopilotMessages([
        {
          id: "assistant-1",
          role: "assistant",
          content: "Ich öffne die Team-Mitglieder-Seite für dich.",
          metadata: {
            transcript_parts: [
              {
                type: "dynamic-tool",
                toolCallId: "tool-nav",
                toolName: "navigate",
                input: { to: "/mdl/team" },
                output: { ok: true },
                state: "output-available",
              },
            ],
          },
        },
      ])
    ).toEqual([
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          withNormalizedToolDisplay({
            type: "dynamic-tool",
            toolCallId: "tool-nav",
            toolName: "navigate",
            state: "output-available",
            input: { to: "/mdl/team" },
            output: { ok: true },
          }),
          {
            type: "text",
            text: "Ich öffne die Team-Mitglieder-Seite für dich.",
          },
        ],
      },
    ]);
  });

  it("fills navigate input from assistant toolCalls when transcript part omits it", () => {
    expect(
      agUiMessagesToCopilotMessages([
        {
          id: "assistant-1",
          role: "assistant",
          content: "Opening team members.",
          toolCalls: [
            {
              id: "tool-nav",
              type: "function",
              function: {
                name: "navigate",
                arguments: '{"to":"/mdl/team"}',
              },
            },
          ],
          metadata: {
            transcript_parts: [
              {
                type: "dynamic-tool",
                toolCallId: "tool-nav",
                toolName: "navigate",
                state: "output-error",
                error: "Only internal application paths are allowed.",
              },
            ],
          },
        },
      ])
    ).toEqual([
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          withNormalizedToolDisplay({
            type: "dynamic-tool",
            toolCallId: "tool-nav",
            toolName: "navigate",
            state: "output-error",
            input: { to: "/mdl/team" },
            errorText: "Only internal application paths are allowed.",
          }),
          { type: "text", text: "Opening team members." },
        ],
      },
    ]);
  });

  it("preserves persisted transcript part order via metadata", () => {
    expect(
      agUiMessagesToCopilotMessages([
        {
          id: "assistant-1",
          role: "assistant",
          content: "Antwort nach den Tools.",
          toolCalls: [
            {
              id: "tool-1",
              type: "function",
              function: {
                name: "engenty_tools_search",
                arguments: "{}",
              },
            },
          ],
          metadata: {
            transcript_parts: [
              {
                type: "dynamic-tool",
                toolCallId: "tool-1",
                toolName: "engenty_tools_search",
                input: {},
                output: { ok: true },
                state: "output-available",
              },
              { type: "text", text: "Antwort nach den Tools." },
            ],
          },
        },
      ])
    ).toEqual([
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          withNormalizedToolDisplay({
            type: "dynamic-tool",
            toolCallId: "tool-1",
            toolName: "engenty_tools_search",
            state: "output-available",
            input: {},
            output: { ok: true },
          }),
          { type: "text", text: "Antwort nach den Tools." },
        ],
      },
    ]);
  });

  it("merges tool results into assistant dynamic-tool parts", () => {
    expect(
      agUiMessagesToCopilotMessages([
        {
          id: "assistant-1",
          role: "assistant",
          toolCalls: [
            {
              id: "tool-1",
              type: "function",
              function: {
                name: "engenty_tools_search",
                arguments:
                  '{"kind":"tool","moduleId":"knowledge-base","query":"faqs"}',
              },
            },
          ],
        },
        {
          id: "tool-result-1",
          role: "tool",
          toolCallId: "tool-1",
          content: JSON.stringify({
            type: "dynamic-tool",
            toolCallId: "tool-1",
            toolName: "engenty_tools_search",
            state: "output-available",
            input: {
              kind: "tool",
              moduleId: "knowledge-base",
              query: "faqs",
            },
            output: { ok: true, matches: [] },
          }),
        },
      ])
    ).toEqual([
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          withNormalizedToolDisplay({
            type: "dynamic-tool",
            toolCallId: "tool-1",
            toolName: "engenty_tools_search",
            state: "output-available",
            input: {
              kind: "tool",
              moduleId: "knowledge-base",
              query: "faqs",
            },
            output: { ok: true, matches: [] },
          }),
        ],
      },
    ]);
  });

  it("treats persisted bare tool output JSON as completed tool results", () => {
    expect(
      agUiMessagesToCopilotMessages([
        {
          id: "assistant-2",
          role: "assistant",
          toolCalls: [
            {
              id: "tool-2",
              type: "function",
              function: {
                name: "engenty_tools_search",
                arguments: '{"moduleId":"knowledge-base"}',
              },
            },
          ],
        },
        {
          id: "assistant-2-tool-tool-2",
          role: "tool",
          toolCallId: "tool-2",
          content: '{"ok":true,"matches":[]}',
        },
      ])
    ).toEqual([
      {
        id: "assistant-2",
        role: "assistant",
        parts: [
          withNormalizedToolDisplay({
            type: "dynamic-tool",
            toolCallId: "tool-2",
            toolName: "engenty_tools_search",
            state: "output-available",
            input: { moduleId: "knowledge-base" },
            output: { ok: true, matches: [] },
          }),
        ],
      },
    ]);
  });

  it("renders requestDecision transcript parts without persisted toolCallId after hydrate", () => {
    const hydrated = buildAgUiMessagesFromSessionMessages([
      {
        id: "user-1",
        created_at: "2026-05-21T12:00:00.000Z",
        parts: [{ type: "text", text: "continue in english" }],
        role: "user",
      },
      {
        id: "assistant-1",
        created_at: "2026-05-21T12:00:01.000Z",
        parts: [
          {
            type: "dynamic-tool",
            toolCallId: "context-tool",
            toolName: "engenty_tools_context",
            input: {},
            output: { ok: true },
            state: "output-available",
          },
          {
            type: "dynamic-tool",
            toolName: "requestDecision",
            output: {
              artifact_id: "artifact-1",
              artifact_type: "decision",
              choices: [
                { id: "en", label: "English" },
                { id: "de", label: "Deutsch" },
              ],
              interrupt_id: "artifact-1",
              title: "Choose a language",
            },
            state: "output-available",
          },
        ],
        role: "assistant",
      },
    ]);

    expect(hydrated.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "tool",
      "tool",
    ]);

    const copilotMessages = agUiMessagesToCopilotMessages(hydrated);
    expect(copilotMessages).toHaveLength(2);
    expect(copilotMessages[1]?.parts).toEqual([
      withNormalizedToolDisplay({
        type: "dynamic-tool",
        toolCallId: "context-tool",
        toolName: "engenty_tools_context",
        state: "output-available",
        input: {},
        output: { ok: true },
      }),
      withNormalizedToolDisplay({
        type: "dynamic-tool",
        toolCallId: "tool-call-1",
        toolName: "requestDecision",
        state: "output-available",
        input: {},
        output: {
          artifact_id: "artifact-1",
          artifact_type: "decision",
          choices: [
            { id: "en", label: "English" },
            { id: "de", label: "Deutsch" },
          ],
          interrupt_id: "artifact-1",
          title: "Choose a language",
        },
      }),
    ]);
  });

  it("marks unresolved tool calls as failed when a run errors", () => {
    let state = emptyState();
    state = reduceEngentyAgUiConversationEvent(state, {
      type: "TOOL_CALL_START",
      toolCallId: "tool-1",
      toolCallName: "engenty_tools_search",
      messageId: "assistant-1",
    });
    state = reduceEngentyAgUiConversationEvent(state, {
      type: "RUN_ERROR",
      message: "Run failed",
      runId: "run-1",
    });

    expect(agUiMessagesToCopilotMessages(state.messages)).toEqual([
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          withNormalizedToolDisplay({
            type: "dynamic-tool",
            toolCallId: "tool-1",
            toolName: "engenty_tools_search",
            state: "output-error",
            input: "",
            errorText: "Run failed",
          }),
        ],
      },
      {
        id: "run-error-run-1",
        role: "assistant",
        parts: [{ type: "text", text: "Run failed" }],
      },
    ]);
  });

  it("treats hydration signatures as equal for same message content", () => {
    const left = [{ id: "user-1", role: "user" as const, content: "Hi" }];
    const right = [{ id: "user-1", role: "user" as const, content: "Hi" }];
    expect(createAgUiHydrationSignature(left)).toBe(
      createAgUiHydrationSignature(right)
    );
    expect(areAgUiHydrationTargetsEqual(left, undefined, right, {})).toBe(true);
  });

  it("detects hydration signature changes for new server messages", () => {
    const current = [{ id: "user-1", role: "user" as const, content: "Hi" }];
    const incoming = [
      { id: "user-1", role: "user" as const, content: "Hi" },
      { id: "assistant-1", role: "assistant" as const, content: "Hello" },
    ];
    expect(areAgUiHydrationTargetsEqual(incoming, undefined, current, {})).toBe(
      false
    );
  });

  it("treats equal empty message lists as unchanged even when run state differs", () => {
    const incoming: [] = [];
    const current: [] = [];
    expect(
      areAgUiHydrationTargetsEqual(incoming, undefined, current, {
        route: { pathname: "/mdl/engenty-copilot/chat/new" },
      })
    ).toBe(true);
  });

  it("does not seed over an existing in-memory transcript", () => {
    const current = [{ id: "user-1", role: "user" as const, content: "hi" }];
    expect(
      shouldSeedAgUiConversationFromInitialMessages({
        currentMessages: current,
        currentState: {},
        incomingMessages: [{ id: "user-2", role: "user", content: "new" }],
        initialMessages: [{ id: "user-2", role: "user", content: "new" }],
        suppressHydration: false,
      })
    ).toBe(false);
  });

  it("does not treat query messages as synchronization after stream snapshots", () => {
    const current = [
      { id: "user-1", role: "user" as const, content: "hi" },
      { id: "assistant-1", role: "assistant" as const, content: "Hello" },
      { id: "tool-1", role: "tool" as const, content: "{}", toolCallId: "t1" },
    ];
    const incoming = [current[0]!];

    expect(
      shouldSeedAgUiConversationFromInitialMessages({
        currentMessages: current,
        currentState: {},
        incomingMessages: incoming,
        initialMessages: incoming,
        suppressHydration: false,
      })
    ).toBe(false);
  });

  it("refuses stale query hydrate when live transcript has more rows", () => {
    const current = [
      { id: "user-1", role: "user" as const, content: "hi" },
      { id: "assistant-1", role: "assistant" as const, content: "Streaming…" },
    ];
    const incoming = [{ id: "user-1", role: "user" as const, content: "hi" }];

    expect(
      shouldRefuseStaleAgUiHydration({
        currentMessages: current,
        incomingMessages: incoming,
      })
    ).toBe(true);
    expect(
      shouldRefuseStaleAgUiHydration({
        currentMessages: [],
        incomingMessages: incoming,
      })
    ).toBe(false);
    expect(
      shouldRefuseStaleAgUiHydration({
        currentMessages: current,
        incomingMessages: current,
      })
    ).toBe(false);
  });

  it("skips hydrate when both sides are empty", () => {
    expect(
      shouldSeedAgUiConversationFromInitialMessages({
        currentMessages: [],
        currentState: { route: { pathname: "/new" } },
        incomingMessages: [],
        initialMessages: [],
        suppressHydration: false,
      })
    ).toBe(false);
  });

  it("seeds an empty conversation from initial server messages", () => {
    const incoming = [{ id: "user-1", role: "user" as const, content: "hi" }];

    expect(
      shouldSeedAgUiConversationFromInitialMessages({
        currentMessages: [],
        currentState: {},
        incomingMessages: incoming,
        initialMessages: incoming,
        suppressHydration: false,
      })
    ).toBe(true);
  });

  it("detects the gap before initial hydrate is applied", () => {
    const incoming = [{ id: "user-1", role: "user" as const, content: "hi" }];

    expect(
      isAwaitingAgUiInitialHydrate({
        currentMessages: [],
        initialMessages: incoming,
      })
    ).toBe(true);
    expect(
      isAwaitingAgUiInitialHydrate({
        currentMessages: incoming,
        initialMessages: incoming,
      })
    ).toBe(false);
    expect(
      isAwaitingAgUiInitialHydrate({
        currentMessages: [],
        initialMessages: [],
      })
    ).toBe(false);
    expect(
      isAwaitingAgUiInitialHydrate({
        currentMessages: [],
        initialMessages: incoming,
        suppressHydration: true,
      })
    ).toBe(false);
  });

  it("labels frontend wrapper for operator display", () => {
    const copilotMessages = agUiMessagesToCopilotMessages([
      {
        id: "tool-result-theme",
        role: "tool",
        toolCallId: "frontend-theme",
        content: JSON.stringify({
          type: "dynamic-tool",
          toolCallId: "frontend-theme",
          toolName: "invoke_frontend_tool",
          state: "output-available",
          input: { name: "shell_set_theme" },
          output: { ok: true },
        }),
      },
    ]);

    expect(copilotMessages).toHaveLength(1);
    const part = copilotMessages[0]?.parts?.[0] as Record<string, unknown>;
    expect(part.toolName).toBe("invoke_frontend_tool");
    expect(part.resolvedToolName).toBe("shell_set_theme");
    expect(part.displayLabel).toBe("Set Theme");
    expect(part.metadata).toBe("shell");
  });

  it("labels catalog execute for operator display", () => {
    const copilotMessages = agUiMessagesToCopilotMessages([
      {
        id: "assistant-1",
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "tool-1",
            type: "function",
            function: {
              name: "engenty_tool_execute",
              arguments: JSON.stringify({ id: "contacts_search" }),
            },
          },
        ],
      },
      {
        id: "tool-1",
        role: "tool",
        toolCallId: "tool-1",
        content: JSON.stringify({
          type: "dynamic-tool",
          toolCallId: "tool-1",
          toolName: "engenty_tool_execute",
          state: "output-available",
          input: { id: "contacts_search" },
          output: { ok: true, data: [] },
        }),
      },
    ]);

    const part = copilotMessages[0]?.parts?.[0] as Record<string, unknown>;
    expect(part.toolName).toBe("engenty_tool_execute");
    expect(part.resolvedToolName).toBe("contacts_search");
    expect(part.displayLabel).toBe("Searched");
    expect(part.metadata).toBe("contacts");
  });

  it("keeps display labels on adapter output only", () => {
    const rawMessages = [
      {
        id: "tool-result-theme",
        role: "tool" as const,
        toolCallId: "frontend-theme",
        content: JSON.stringify({
          type: "dynamic-tool",
          toolCallId: "frontend-theme",
          toolName: "invoke_frontend_tool",
          state: "output-available",
          input: { name: "shell_set_theme" },
          output: { ok: true },
        }),
      },
    ];

    const parsed = JSON.parse(rawMessages[0].content) as Record<
      string,
      unknown
    >;
    expect(parsed.displayLabel).toBeUndefined();
    expect(parsed.resolvedToolName).toBeUndefined();

    const copilotMessages = agUiMessagesToCopilotMessages(rawMessages);
    const part = copilotMessages[0]?.parts?.[0] as Record<string, unknown>;
    expect(part.displayLabel).toBe("Set Theme");
    expect(part.metadata).toBe("shell");
    expect(part.resolvedToolName).toBe("shell_set_theme");
  });
});

describe("CUSTOM engenty.sub_agent.progress", () => {
  it("appends progress lines to matching assistant transcript_parts", () => {
    let state = emptyState();
    state = {
      ...state,
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          content: "",
          metadata: {
            transcript_parts: [
              {
                type: "dynamic-tool",
                toolCallId: "sub-1",
                toolName: "agent-engenty_cli",
                state: "input-available",
                input: { task: "pwd" },
              },
            ],
          },
        },
      ],
    };

    state = reduceEngentyAgUiConversationEvent(state, {
      type: "CUSTOM",
      name: "engenty.sub_agent.progress",
      value: {
        messageId: "assistant-1",
        toolCallId: "sub-1",
        line: "$ pwd",
      },
    });

    const parts = (
      state.messages[0]?.metadata as { transcript_parts?: unknown[] }
    )?.transcript_parts;
    const part = parts?.[0] as { progressLines?: string[] };
    expect(part.progressLines).toEqual(["$ pwd"]);

    state = reduceEngentyAgUiConversationEvent(state, {
      type: "CUSTOM",
      name: "engenty.sub_agent.progress",
      value: {
        messageId: "assistant-1",
        toolCallId: "sub-1",
        line: "/workspace",
      },
    });

    const nextPart = (
      state.messages[0]?.metadata as { transcript_parts?: unknown[] }
    )?.transcript_parts?.[0] as { progressLines?: string[] };
    expect(nextPart.progressLines).toEqual(["$ pwd", "/workspace"]);
  });
});
