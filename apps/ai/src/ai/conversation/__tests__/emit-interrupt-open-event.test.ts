// Every interrupt emitter must put the card's CONTENT on the wire.
//
// The RUN_FINISHED interrupt outcome is schema-stripped down to an id, a reason
// and a title — not the choices. The full artifact rides the CUSTOM
// `engenty.open_interrupt` event, which is what the client turns into the
// chooser. The transcript is NOT a fallback for it: `requestDecision` suspends
// natively now, so there is no tool RESULT for the artifact to be read off, and
// a lane that skips this event leaves the user with a spinning "Decision needed"
// row and no way to answer.
import type { AGUIEvent } from "@engenty/ag-ui-bridge";
import { ENGENTY_OPEN_INTERRUPT_EVENT, EventType } from "@engenty/ag-ui-bridge";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ThreadStore } from "../../../dal/threads/index.js";
import type { AiSessionScope } from "../../sessions/types.js";
import {
  decisionArtifactHasDurableInbox,
  emitArtifactInterrupt,
  emitFrontendToolInterrupt,
  emitToolApprovalInterrupt,
} from "../emit-interrupt.js";

const notifyThreadInterrupt = vi.fn<(...args: unknown[]) => Promise<undefined>>(
  async () => undefined
);
vi.mock("../../../notifications/thread-interrupts.js", () => ({
  notifyThreadInterrupt: (...args: unknown[]) => notifyThreadInterrupt(...args),
  resolveThreadInterruptNotifications: vi.fn(async () => undefined),
}));

const SCOPE: AiSessionScope = {
  tenantId: "tenant-1",
  userId: "user-1",
} as AiSessionScope;

const THREAD_ID = "thread-1";

function buildStore(): {
  patches: Record<string, unknown>[];
  store: ThreadStore;
} {
  const patches: Record<string, unknown>[] = [];
  const store = {
    mergeThreadMetadataForUser: async (args: {
      patch: Record<string, unknown>;
    }) => {
      patches.push(args.patch);
      return {};
    },
  } as unknown as ThreadStore;
  return { patches, store };
}

function collector() {
  const events: AGUIEvent[] = [];
  return { emit: (event: AGUIEvent) => events.push(event), events };
}

function openInterruptEvents(events: AGUIEvent[]) {
  return events.filter(
    (event) =>
      (event as { type?: unknown }).type === EventType.CUSTOM &&
      (event as { name?: unknown }).name === ENGENTY_OPEN_INTERRUPT_EVENT
  );
}

const DECISION_ARTIFACT = {
  artifact_id: "artifact-1",
  artifact_type: "decision" as const,
  choices: [
    { id: "tl-300", label: "TL-300 Tool-Plattform" },
    { id: "wsp-01", label: "WSP-01 E2E project" },
  ],
  interrupt_id: "interrupt-1",
  title: "Welches Projekt möchtest du ansehen?",
};

describe("interrupt emitters and the open-interrupt side channel", () => {
  beforeEach(() => {
    notifyThreadInterrupt.mockClear();
  });

  it("carries a suspended decision's choices on the CUSTOM event", async () => {
    const { emit, events } = collector();
    const { store } = buildStore();

    const handled = await emitArtifactInterrupt({
      busRunId: "bus-run-1",
      emit,
      result: DECISION_ARTIFACT,
      resumeRunId: "mastra-run-1",
      scope: SCOPE,
      sessionMetadata: {},
      store,
      threadId: THREAD_ID,
      toolCallId: "call-1",
    });

    expect(handled).toBe(true);
    const [open] = openInterruptEvents(events);
    expect(open).toBeDefined();
    const value = (open as { value: Record<string, unknown> }).value;
    expect(value.kind).toBe("decision");
    expect(value.choices).toEqual(DECISION_ARTIFACT.choices);
    expect(value.title).toBe(DECISION_ARTIFACT.title);
    expect(value.tool_call_id).toBe("call-1");
    // The parked run id is what routes the answer back to THIS run.
    expect(value.run_id).toBe("mastra-run-1");
  });

  it("emits the open interrupt BEFORE the RUN_FINISHED that ends the turn", async () => {
    const { emit, events } = collector();
    const { store } = buildStore();

    await emitArtifactInterrupt({
      busRunId: "bus-run-1",
      emit,
      result: DECISION_ARTIFACT,
      scope: SCOPE,
      sessionMetadata: {},
      store,
      threadId: THREAD_ID,
      toolCallId: "call-1",
    });

    const types = events.map((event) => (event as { type: string }).type);
    expect(types.indexOf(EventType.CUSTOM)).toBeLessThan(
      types.indexOf(EventType.RUN_FINISHED)
    );
  });

  it("still emits it when the metadata write fails", async () => {
    const { emit, events } = collector();
    const store = {
      mergeThreadMetadataForUser: async () => {
        throw new Error("db down");
      },
    } as unknown as ThreadStore;

    // A card the user can answer is worth more than a persisted one they cannot
    // see; the persistence failure is logged, not fatal.
    await emitArtifactInterrupt({
      busRunId: "bus-run-1",
      emit,
      result: DECISION_ARTIFACT,
      scope: SCOPE,
      sessionMetadata: {},
      store,
      threadId: THREAD_ID,
      toolCallId: "call-1",
    });

    expect(openInterruptEvents(events)).toHaveLength(1);
  });

  it("keeps the same guarantee for approvals and frontend tools", async () => {
    const approval = collector();
    const { store } = buildStore();
    await emitToolApprovalInterrupt({
      busRunId: "bus-run-1",
      emit: approval.emit,
      payload: {
        kind: "tool_approval",
        operation_id: "projects.task.create",
        requires_approval: true,
        risk_level: "high",
      },
      resumeRunId: "mastra-run-1",
      scope: SCOPE,
      sessionMetadata: {},
      store,
      threadId: THREAD_ID,
      toolCallId: "call-approve",
    });
    expect(openInterruptEvents(approval.events)).toHaveLength(1);

    const frontend = collector();
    await emitFrontendToolInterrupt({
      busRunId: "bus-run-1",
      emit: frontend.emit,
      mergedDefinitions: [
        {
          description: "navigate",
          metadata: { engenty: { title: "Navigate" } },
          name: "navigate",
          parameters: {},
        },
      ] as never,
      payload: { args: {}, toolCallId: "call-nav", toolName: "navigate" },
      resumeRunId: "mastra-run-1",
      scope: SCOPE,
      sessionMetadata: {},
      store,
      threadId: THREAD_ID,
    });
    expect(openInterruptEvents(frontend.events)).toHaveLength(1);
  });

  it("files a thread-interrupt notification for an ordinary question", async () => {
    const { emit } = collector();
    const { store } = buildStore();
    await emitArtifactInterrupt({
      busRunId: "bus-run-1",
      emit,
      result: DECISION_ARTIFACT,
      resumeRunId: "mastra-run-1",
      scope: SCOPE,
      sessionMetadata: {},
      store,
      threadId: THREAD_ID,
      toolCallId: "call-1",
    });
    expect(notifyThreadInterrupt).toHaveBeenCalledWith(
      expect.objectContaining({
        interruptId: DECISION_ARTIFACT.interrupt_id,
        kind: "agent_question",
        title: DECISION_ARTIFACT.title,
      })
    );
  });

  it("does not file a second inbox row when the artifact already has one", async () => {
    const { emit, events } = collector();
    const { store } = buildStore();
    const hire = {
      ...DECISION_ARTIFACT,
      durable_inbox: true,
      title: "Hire App Coder?",
    };
    expect(decisionArtifactHasDurableInbox(hire)).toBe(true);

    const handled = await emitArtifactInterrupt({
      busRunId: "bus-run-1",
      emit,
      result: hire,
      resumeRunId: "mastra-run-1",
      scope: SCOPE,
      sessionMetadata: {},
      store,
      threadId: THREAD_ID,
      toolCallId: "call-hire",
    });

    expect(handled).toBe(true);
    expect(openInterruptEvents(events)).toHaveLength(1);
    expect(notifyThreadInterrupt).not.toHaveBeenCalled();
  });
});
