import { EventType } from "@engenty/ag-ui-bridge";
import { describe, expect, it } from "vitest";
import type { AiAgentRunSummary } from "../../lib/admin/ai-runtime-types.js";
import type { EngentyAgUiMessage } from "../conversation.js";
import {
  buildRecoveryMessagesSnapshotEvent,
  coalesceRunEventText,
  createRecoveryRunEventReplayFilter,
  isAppsAiRunInFlightStatus,
  isTerminalRunWithPotentialUnflushedText,
  partitionSnapshotForRunAttach,
  pickLatestInFlightAppsAiRun,
  pickLatestTerminalAppsAiRun,
  shouldApplyRecoveryMessagesSnapshot,
  shouldApplyTerminalRunMessagesSnapshot,
  shouldAttemptAppsAiRunRecovery,
  shouldContinueAppsAiRunRecovery,
  transcriptMissingAssistantMessage,
  withLanePrefixBeforeTail,
} from "./apps-ai-run-recovery-gating.js";

function runSummary(
  partial: Partial<AiAgentRunSummary> & Pick<AiAgentRunSummary, "id" | "status">
): AiAgentRunSummary {
  return {
    workflow_id: null,
    agent_id: "engenty.copilot",
    created_at: "2026-01-01T00:00:00.000Z",
    error: null,
    finished_at: null,
    request_id: null,
    started_at: "2026-01-01T00:00:00.000Z",
    summary: null,
    tenant_id: "t1",
    thread_id: "thread-1",
    trigger: "message",
    ...partial,
  };
}

describe("apps-ai-run-recovery-gating", () => {
  it("detects in-flight run statuses", () => {
    expect(isAppsAiRunInFlightStatus("running")).toBe(true);
    expect(isAppsAiRunInFlightStatus("queued")).toBe(true);
    expect(isAppsAiRunInFlightStatus("waiting_for_approval")).toBe(false);
    expect(isAppsAiRunInFlightStatus("waiting_for_input")).toBe(false);
    expect(isAppsAiRunInFlightStatus("succeeded")).toBe(false);
  });

  it("picks the newest in-flight run from oldest-first session runs", () => {
    const runs = [
      runSummary({ id: "run-old", status: "succeeded" }),
      runSummary({ id: "run-active", status: "running" }),
      runSummary({ id: "run-queued", status: "queued" }),
    ];
    expect(pickLatestInFlightAppsAiRun(runs)?.id).toBe("run-queued");
  });

  it("gates recovery attempts on lane readiness", () => {
    expect(
      shouldAttemptAppsAiRunRecovery({
        enabled: true,
        hydrateEnabled: true,
        isTransportReady: true,
        localSubmitInFlight: false,
        submitStatus: "ready",
        threadId: "thread-1",
      })
    ).toBe(true);
    expect(
      shouldAttemptAppsAiRunRecovery({
        enabled: true,
        hydrateEnabled: true,
        isTransportReady: true,
        localSubmitInFlight: false,
        submitStatus: "streaming",
        threadId: "thread-1",
      })
    ).toBe(true);
    expect(
      shouldAttemptAppsAiRunRecovery({
        enabled: true,
        hydrateEnabled: true,
        isTransportReady: true,
        localSubmitInFlight: true,
        submitStatus: "streaming",
        threadId: "thread-1",
      })
    ).toBe(false);
    expect(
      shouldAttemptAppsAiRunRecovery({
        enabled: true,
        hydrateEnabled: true,
        isTransportReady: true,
        localSubmitInFlight: true,
        submitStatus: "ready",
        threadId: "thread-1",
      })
    ).toBe(false);
    expect(
      shouldAttemptAppsAiRunRecovery({
        enabled: false,
        hydrateEnabled: true,
        isTransportReady: true,
        localSubmitInFlight: false,
        submitStatus: "ready",
        threadId: "thread-1",
      })
    ).toBe(false);
  });

  it("applies recovery snapshots when server is ahead or lane is empty", () => {
    const user = {
      id: "u1",
      role: "user" as const,
      content: "hi",
    };
    const partialAssistant = {
      id: "a1",
      role: "assistant" as const,
      content: "partial reply",
    };
    expect(
      shouldApplyRecoveryMessagesSnapshot({
        liveMessages: [],
        snapshotMessages: [user, partialAssistant],
      })
    ).toBe(true);
    expect(
      shouldApplyRecoveryMessagesSnapshot({
        liveMessages: [user],
        snapshotMessages: [user, partialAssistant],
      })
    ).toBe(true);
    expect(
      shouldApplyRecoveryMessagesSnapshot({
        liveMessages: [user, partialAssistant],
        snapshotMessages: [user],
      })
    ).toBe(false);
    expect(
      shouldApplyRecoveryMessagesSnapshot({
        liveMessages: [
          user,
          {
            id: "a-live",
            role: "assistant",
            content: "short",
          },
        ],
        snapshotMessages: [
          user,
          {
            id: "a-db",
            role: "assistant",
            content: "longer partial reply",
          },
        ],
      })
    ).toBe(true);
  });

  it("refuses recovery snapshots that drop a live requestDecision tool row", () => {
    expect(
      shouldApplyRecoveryMessagesSnapshot({
        liveMessages: [
          {
            id: "user-1",
            role: "user",
            content: "pick a color",
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
            content: "pick a color",
          },
          {
            id: "assistant-1",
            role: "assistant",
            content: "Choose one",
          },
        ],
      })
    ).toBe(false);
  });

  // Attached-stream replay: text streams live for messages the DB snapshot
  // has never seen; snapshot-known messages stay snapshot-owned (no doubling).
  it("streams text live for messages absent from the snapshot", () => {
    const replay = createRecoveryRunEventReplayFilter({
      snapshotMessageIds: new Set(["flushed-1"]),
    });
    expect(
      replay({
        type: EventType.TEXT_MESSAGE_START,
        messageId: "live-1",
        role: "assistant",
      } as never)
    ).toBe(true);
    expect(
      replay({
        type: EventType.TEXT_MESSAGE_CONTENT,
        delta: "hello",
        messageId: "live-1",
      } as never)
    ).toBe(true);
    expect(
      replay({ type: EventType.TEXT_MESSAGE_END, messageId: "live-1" } as never)
    ).toBe(true);
    expect(
      replay({ type: EventType.RUN_FINISHED, runId: "run-1" } as never)
    ).toBe(true);
  });

  it("never replays text for a message the lane already renders", () => {
    // The lane having the message means it was already streamed into this
    // window (own POST stream or an earlier attach) — replaying again doubles
    // the text. Regression: three racing terminal attaches quadrupled the
    // final message.
    const replay = createRecoveryRunEventReplayFilter({
      laneHasMessage: (id) => id === "already-in-lane",
      snapshotMessageIds: new Set<string>(),
    });
    expect(
      replay({
        type: EventType.TEXT_MESSAGE_START,
        messageId: "already-in-lane",
        role: "assistant",
      } as never)
    ).toBe(false);
    expect(
      replay({
        type: EventType.TEXT_MESSAGE_CONTENT,
        delta: "dup",
        messageId: "already-in-lane",
      } as never)
    ).toBe(false);
    expect(
      replay({
        type: EventType.TEXT_MESSAGE_START,
        messageId: "fresh",
        role: "assistant",
      } as never)
    ).toBe(true);
  });

  it("keeps snapshot-known messages snapshot-owned during replay", () => {
    const replay = createRecoveryRunEventReplayFilter({
      snapshotMessageIds: new Set(["flushed-1"]),
    });
    expect(
      replay({
        type: EventType.TEXT_MESSAGE_START,
        messageId: "flushed-1",
        role: "assistant",
      } as never)
    ).toBe(false);
    expect(
      replay({
        type: EventType.TEXT_MESSAGE_CONTENT,
        delta: "dup",
        messageId: "flushed-1",
      } as never)
    ).toBe(false);
    // A delta whose START was never admitted (or missing ids) stays dropped.
    expect(
      replay({
        type: EventType.TEXT_MESSAGE_CONTENT,
        delta: "orphan",
        messageId: "never-started",
      } as never)
    ).toBe(false);
    expect(replay({ type: EventType.MESSAGES_SNAPSHOT } as never)).toBe(false);
  });

  it("replays the role:user turn echo for windows that lack it", () => {
    // The user turn arrives as a protocol-native role:"user" text trio (AG-UI
    // TEXT_MESSAGE_START role union) — same per-message gating as assistant
    // text: admitted when neither the snapshot nor the lane has the id.
    const replay = createRecoveryRunEventReplayFilter({
      laneHasMessage: () => false,
      snapshotMessageIds: new Set<string>(),
    });
    expect(
      replay({
        type: EventType.TEXT_MESSAGE_START,
        messageId: "user-1",
        role: "user",
      } as never)
    ).toBe(true);
    expect(
      replay({
        type: EventType.TEXT_MESSAGE_CONTENT,
        delta: "hallo",
        messageId: "user-1",
      } as never)
    ).toBe(true);
    // The sending window holds the optimistic user message — no replay.
    const senderReplay = createRecoveryRunEventReplayFilter({
      laneHasMessage: (id) => id === "user-1",
      snapshotMessageIds: new Set<string>(),
    });
    expect(
      senderReplay({
        type: EventType.TEXT_MESSAGE_START,
        messageId: "user-1",
        role: "user",
      } as never)
    ).toBe(false);
  });

  it("continues recovery only while a run is actively executing", () => {
    expect(
      shouldContinueAppsAiRunRecovery({
        activeRunStatus: "running",
        threadStatus: "idle",
      })
    ).toBe(true);
    expect(
      shouldContinueAppsAiRunRecovery({
        activeRunStatus: "queued",
        threadStatus: "running",
      })
    ).toBe(true);
    expect(
      shouldContinueAppsAiRunRecovery({
        activeRunStatus: "succeeded",
        threadStatus: "running",
      })
    ).toBe(false);
    expect(
      shouldContinueAppsAiRunRecovery({
        activeRunStatus: undefined,
        threadStatus: "running",
      })
    ).toBe(false);
    expect(
      shouldContinueAppsAiRunRecovery({
        activeRunStatus: "succeeded",
        threadStatus: "idle",
      })
    ).toBe(false);
  });

  it("stops recovery when the thread or run is waiting on the user", () => {
    expect(
      shouldContinueAppsAiRunRecovery({
        activeRunStatus: "waiting_for_input",
        threadStatus: "idle",
      })
    ).toBe(false);
    expect(
      shouldContinueAppsAiRunRecovery({
        activeRunStatus: "succeeded",
        threadStatus: "waiting",
      })
    ).toBe(false);
  });

  it("builds a MESSAGES_SNAPSHOT event for recovery apply", () => {
    const snapshot = buildRecoveryMessagesSnapshotEvent([
      { id: "u1", role: "user", content: "hi" },
    ]);
    expect(snapshot.type).toBe(EventType.MESSAGES_SNAPSHOT);
    expect(
      (snapshot as { messages?: { id: string }[] }).messages?.[0]?.id
    ).toBe("u1");
  });

  it("picks the newest terminal run when no in-flight run exists", () => {
    const runs = [
      runSummary({ id: "run-old", status: "succeeded" }),
      runSummary({ id: "run-cancelled", status: "cancelled" }),
    ];
    expect(pickLatestTerminalAppsAiRun(runs)?.id).toBe("run-cancelled");
  });

  it("detects terminal runs with potential unflushed text", () => {
    expect(
      isTerminalRunWithPotentialUnflushedText(
        runSummary({ id: "r1", status: "cancelled" })
      )
    ).toBe(true);
    expect(
      isTerminalRunWithPotentialUnflushedText(
        runSummary({ id: "r1", status: "failed" })
      )
    ).toBe(true);
    expect(
      isTerminalRunWithPotentialUnflushedText(
        runSummary({ id: "r1", status: "succeeded" })
      )
    ).toBe(false);
    expect(isTerminalRunWithPotentialUnflushedText(null)).toBe(false);
  });

  it("detects when transcript ends with a user message (no assistant yet)", () => {
    const user = {
      id: "u1",
      role: "user" as const,
      content: [{ type: "text" as const, text: "hi" }],
    };
    const assistant = { id: "a1", role: "assistant" as const, content: "" };
    expect(transcriptMissingAssistantMessage([user])).toBe(true);
    expect(transcriptMissingAssistantMessage([user, assistant])).toBe(false);
    expect(transcriptMissingAssistantMessage([])).toBe(false);
  });

  it("coalesces TEXT_MESSAGE_CONTENT deltas from run events by message id", () => {
    const events = [
      {
        event_type: EventType.TEXT_MESSAGE_START,
        payload: { type: EventType.TEXT_MESSAGE_START, messageId: "m1" },
      },
      {
        event_type: EventType.TEXT_MESSAGE_CONTENT,
        payload: {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: "m1",
          delta: "Hello ",
        },
      },
      {
        event_type: EventType.TEXT_MESSAGE_CONTENT,
        payload: {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: "m1",
          delta: "world",
        },
      },
    ];
    const result = coalesceRunEventText(events);
    expect(result.get("m1")).toBe("Hello world");
  });

  it("coalesces deltas using active message id when messageId absent on content event", () => {
    const events = [
      {
        event_type: EventType.TEXT_MESSAGE_START,
        payload: { type: EventType.TEXT_MESSAGE_START, messageId: "m2" },
      },
      {
        event_type: EventType.TEXT_MESSAGE_CONTENT,
        payload: { type: EventType.TEXT_MESSAGE_CONTENT, delta: "partial" },
      },
    ];
    const result = coalesceRunEventText(events);
    expect(result.get("m2")).toBe("partial");
  });

  it("never coalesces the role:user turn echo into assistant text", () => {
    // A cancelled run's log starts with the user-turn echo trio. Coalescing it
    // re-surfaced the user's own prompt as a synthetic assistant message after
    // Stop — the sent prompt rendered twice (persisted row + echo copy).
    const events = [
      {
        event_type: EventType.TEXT_MESSAGE_START,
        payload: {
          type: EventType.TEXT_MESSAGE_START,
          messageId: "user-echo",
          role: "user",
        },
      },
      {
        event_type: EventType.TEXT_MESSAGE_CONTENT,
        payload: {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: "user-echo",
          delta: "Create a book keeping agent",
        },
      },
      {
        event_type: EventType.TEXT_MESSAGE_END,
        payload: { type: EventType.TEXT_MESSAGE_END, messageId: "user-echo" },
      },
      {
        event_type: EventType.TEXT_MESSAGE_START,
        payload: {
          type: EventType.TEXT_MESSAGE_START,
          messageId: "a1",
          role: "assistant",
        },
      },
      {
        event_type: EventType.TEXT_MESSAGE_CONTENT,
        payload: {
          type: EventType.TEXT_MESSAGE_CONTENT,
          delta: "Working on it",
        },
      },
    ];
    const result = coalesceRunEventText(events);
    expect(result.has("user-echo")).toBe(false);
    expect(result.get("a1")).toBe("Working on it");
  });

  describe("partitionSnapshotForRunAttach", () => {
    const withCreatedAt = (
      id: string,
      role: "user",
      createdAt: string | null,
      text = "text"
    ): EngentyAgUiMessage => ({
      id,
      role,
      content: [{ type: "text" as const, text }],
      ...(createdAt ? { metadata: { created_at: createdAt } } : {}),
    });

    const withAssistantCreatedAt = (
      id: string,
      createdAt: string | null,
      text = "text"
    ): EngentyAgUiMessage => ({
      id,
      role: "assistant",
      content: text,
      ...(createdAt ? { metadata: { created_at: createdAt } } : {}),
    });

    it("drops rows persisted by the attached run, keeps older rows", () => {
      const { kept, replayOwned } = partitionSnapshotForRunAttach({
        messages: [
          withCreatedAt("prev-user", "user", "2026-01-01T00:00:00.000Z"),
          withAssistantCreatedAt("prev-assistant", "2026-01-01T00:00:05Z"),
          withCreatedAt("turn-user", "user", "2026-01-01T00:01:00.100Z"),
          withAssistantCreatedAt(
            "turn-partial-assistant",
            "2026-01-01T00:01:02Z",
            "Step one"
          ),
        ],
        runStartedAt: "2026-01-01T00:01:00.000Z",
      });
      expect(kept.map((message) => message.id)).toEqual([
        "prev-user",
        "prev-assistant",
      ]);
      expect(replayOwned.map((message) => message.id)).toEqual([
        "turn-user",
        "turn-partial-assistant",
      ]);
    });

    it("keeps a resumed run's pre-suspend flush (older than the resume run)", () => {
      const { kept, replayOwned } = partitionSnapshotForRunAttach({
        messages: [
          withCreatedAt("turn-user", "user", "2026-01-01T00:01:00Z"),
          withAssistantCreatedAt(
            "pre-suspend-assistant",
            "2026-01-01T00:01:05Z",
            "before the frontend tool"
          ),
        ],
        // Resume run started after the suspend flush.
        runStartedAt: "2026-01-01T00:02:00Z",
      });
      expect(kept.map((message) => message.id)).toEqual([
        "turn-user",
        "pre-suspend-assistant",
      ]);
      expect(replayOwned).toEqual([]);
    });

    it("keeps everything when the run start or row timestamp is unusable", () => {
      const messages = [
        withAssistantCreatedAt("no-timestamp", null),
        withAssistantCreatedAt("dated", "2026-01-01T00:05:00Z"),
      ];
      expect(
        partitionSnapshotForRunAttach({ messages, runStartedAt: null })
          .replayOwned
      ).toEqual([]);
      expect(
        partitionSnapshotForRunAttach({
          messages,
          runStartedAt: "not-a-date",
        }).replayOwned
      ).toEqual([]);
      // Row without created_at survives even with a valid run start.
      const { kept } = partitionSnapshotForRunAttach({
        messages,
        runStartedAt: "2026-01-01T00:00:00Z",
      });
      expect(kept.map((message) => message.id)).toEqual(["no-timestamp"]);
    });
  });

  describe("shouldApplyTerminalRunMessagesSnapshot", () => {
    const user = {
      id: "u1",
      role: "user" as const,
      content: "hi",
    };
    const assistant = (id: string, text: string) => ({
      id,
      role: "assistant" as const,
      content: text,
    });

    it("heals a lane holding BOTH copies of the turn (id split duplicate)", () => {
      // Count gate rejected this forever: lane (3) > snapshot (2).
      expect(
        shouldApplyTerminalRunMessagesSnapshot({
          liveMessages: [
            user,
            assistant("db-partial", "Step one"),
            assistant("stream-full", "Step one Step two"),
          ],
          snapshotMessages: [user, assistant("db-full", "Step one Step two")],
        })
      ).toBe(true);
    });

    it("skips while the coalescer's final flush lags the stream", () => {
      expect(
        shouldApplyTerminalRunMessagesSnapshot({
          liveMessages: [user, assistant("stream-full", "the whole answer")],
          snapshotMessages: [user, assistant("db-partial", "the whole")],
        })
      ).toBe(false);
    });

    it("rejects empty snapshots and applies over assistant-free lanes", () => {
      expect(
        shouldApplyTerminalRunMessagesSnapshot({
          liveMessages: [user],
          snapshotMessages: [],
        })
      ).toBe(false);
      expect(
        shouldApplyTerminalRunMessagesSnapshot({
          liveMessages: [user],
          snapshotMessages: [user, assistant("db", "reply")],
        })
      ).toBe(true);
    });
  });
});

describe("withLanePrefixBeforeTail", () => {
  const msg = (id: string, content = id): EngentyAgUiMessage =>
    ({ content, id, role: "user" }) as EngentyAgUiMessage;
  const ids = (messages: readonly EngentyAgUiMessage[]) =>
    messages.map((message) => message.id);

  it("keeps the lane's older rows in front of the persisted tail", () => {
    const merged = withLanePrefixBeforeTail({
      liveMessages: [msg("a"), msg("b"), msg("c", "partial")],
      tailMessages: [msg("c", "final"), msg("d")],
    });
    expect(ids(merged)).toEqual(["a", "b", "c", "d"]);
    expect(merged[2]?.content).toBe("final");
  });

  it("takes the tail as is when the lane never saw its first row", () => {
    expect(
      ids(
        withLanePrefixBeforeTail({
          liveMessages: [msg("x")],
          tailMessages: [msg("c"), msg("d")],
        })
      )
    ).toEqual(["c", "d"]);
  });
});
