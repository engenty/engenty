import { EventType } from "@engenty/ag-ui-bridge";
import { describe, expect, it } from "vitest";
import type { AiAgentRunSummary } from "../../lib/admin/ai-runtime-types.js";
import {
  buildRecoveryMessagesSnapshotEvent,
  coalesceRunEventText,
  isAppsAiRunInFlightStatus,
  isTerminalRunWithPotentialUnflushedText,
  pickLatestInFlightAppsAiRun,
  pickLatestTerminalAppsAiRun,
  shouldApplyRecoveryMessagesSnapshot,
  shouldAttemptAppsAiRunRecovery,
  shouldContinueAppsAiRunRecovery,
  shouldReplayRecoveryRunEvent,
  transcriptMissingAssistantMessage,
} from "./apps-ai-run-recovery-gating.js";

function runSummary(
  partial: Partial<AiAgentRunSummary> & Pick<AiAgentRunSummary, "id" | "status">
): AiAgentRunSummary {
  return {
    action_id: null,
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
      content: [{ type: "text" as const, text: "hi" }],
    };
    const partialAssistant = {
      id: "a1",
      role: "assistant" as const,
      content: [{ type: "text" as const, text: "partial reply" }],
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
            content: [{ type: "text", text: "short" }],
          },
        ],
        snapshotMessages: [
          user,
          {
            id: "a-db",
            role: "assistant",
            content: [{ type: "text", text: "longer partial reply" }],
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
    ).toBe(false);
  });

  it("skips transcript replay events during recovery", () => {
    expect(
      shouldReplayRecoveryRunEvent({
        type: EventType.TEXT_MESSAGE_CONTENT,
        delta: "hello",
        messageId: "m1",
      } as never)
    ).toBe(false);
    expect(
      shouldReplayRecoveryRunEvent({
        type: EventType.RUN_FINISHED,
        runId: "run-1",
      } as never)
    ).toBe(true);
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
      { id: "u1", role: "user", content: [{ type: "text", text: "hi" }] },
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
    const user = { id: "u1", role: "user" as const, content: [] };
    const assistant = { id: "a1", role: "assistant" as const, content: [] };
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
});
