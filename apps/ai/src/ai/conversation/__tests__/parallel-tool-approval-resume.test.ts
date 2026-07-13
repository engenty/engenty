// Regression: TWO tool calls in one step that both require approval (the
// parallel engenty_tool_execute shape). Mastra serializes suspending tools
// (any tool with a suspendSchema forces tool-call concurrency 1), so the
// approvals surface ONE AT A TIME: interrupt A -> approve -> interrupt B ->
// approve -> finish. The app's interrupt/park/resume legs must carry that
// chain without wedging — and a resume for a tool call that is NOT suspended
// (duplicate/stale approval click) must error WITHOUT destroying the parked
// run, so the real interrupt stays resumable.
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readAgUiOpenInterrupt } from "@engenty/ag-ui-bridge";
import { Agent } from "@mastra/core/agent";
import { AgentController } from "@mastra/core/agent-controller";
import { InMemoryStore } from "@mastra/core/storage";
import { createTool } from "@mastra/core/tools";
import { LocalFilesystem, Workspace } from "@mastra/core/workspace";
import { Memory } from "@mastra/memory";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { ToolApprovalSuspendPayload } from "../../../../ai/tools/engenty-tools/index.js";
import type { AgentSessionStore } from "../../../dal/agent-sessions/index.js";
import { subscribeRunEvents } from "../../sessions/run-event-bus.js";
import type { AiSessionScope } from "../../sessions/types.js";
import { emitToolApprovalInterrupt } from "../emit-interrupt.js";
import { resumeConversationRun } from "../resume-conversation-run.js";
import { parkSessionRun } from "../session-park.js";

const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };

/** One generic gated tool, like engenty_tool_execute: suspends unless resumed with approval. */
function makeSuspendingTool(id: string, log: string[]) {
  return createTool({
    id,
    description: `gate ${id}`,
    inputSchema: z.object({ q: z.string().optional() }),
    suspendSchema: z.object({
      kind: z.literal("tool_approval"),
      operation_id: z.string(),
      requires_approval: z.boolean(),
      risk_level: z.enum(["low", "medium", "high", "critical"]),
    }),
    resumeSchema: z.object({
      approved: z.boolean(),
      choice_id: z.string().optional(),
    }),
    execute: async (input, ctx) => {
      const resume = (ctx as { agent?: { resumeData?: unknown } })?.agent
        ?.resumeData as { approved?: boolean } | undefined;
      const op = (input as { q?: string })?.q ?? "?";
      log.push(`${op}:${resume?.approved ? "approved" : "gate"}`);
      if (resume?.approved) {
        return { ok: true, ran: op };
      }
      if (resume && resume.approved === false) {
        return { ok: false, denied: op };
      }
      const suspend = (
        ctx as { agent?: { suspend?: (p: unknown) => Promise<unknown> } }
      )?.agent?.suspend;
      if (!suspend) {
        throw new Error("no suspend available");
      }
      await suspend({
        kind: "tool_approval",
        operation_id: op,
        requires_approval: true,
        risk_level: "high",
      });
      return undefined as never;
    },
  });
}

/** Session harness: mock model issues two gated calls in step 1, text in step 2. */
async function buildHarness(log: string[]) {
  let call = 0;
  const doStream = async () => {
    call += 1;
    if (call === 1) {
      return {
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start", warnings: [] },
            {
              type: "tool-call",
              toolCallId: "call-a",
              toolName: "engenty_gate",
              input: JSON.stringify({ q: "op_a" }),
            },
            {
              type: "tool-call",
              toolCallId: "call-b",
              toolName: "engenty_gate",
              input: JSON.stringify({ q: "op_b" }),
            },
            { type: "finish", finishReason: "tool-calls", usage },
          ],
        }),
      };
    }
    return {
      stream: simulateReadableStream({
        chunks: [
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "t1" },
          { type: "text-delta", id: "t1", delta: "done" },
          { type: "text-end", id: "t1" },
          { type: "finish", finishReason: "stop", usage },
        ],
      }),
    };
  };
  const model = new MockLanguageModelV3({ doStream: doStream as never });

  const agent = new Agent({
    name: "approval-chain-repro",
    instructions: "test",
    model: model as never,
    tools: { engenty_gate: makeSuspendingTool("engenty_gate", log) },
  } as never);

  const memory = new Memory({
    storage: new InMemoryStore(),
    options: { semanticRecall: false, workingMemory: { enabled: false } },
  });

  const basePath = path.join(tmpdir(), "parallel-tool-approval-resume");
  mkdirSync(basePath, { recursive: true });
  const controller = new AgentController({
    agent,
    defaultModeId: "default",
    id: `approval-chain-${Math.random().toString(36).slice(2)}`,
    memory: memory as never,
    modes: [{ id: "default", name: "Default" }],
    resourceId: "user-1",
  });
  await controller.init();
  const session = await controller.createSession({
    id: controller.id,
    ownerId: "user-1",
    resourceId: "user-1",
    workspace: new Workspace({
      filesystem: new LocalFilesystem({ basePath }),
      name: "repro-ws",
    }),
  });
  await session.state.set({ yolo: true });
  return { controller, session };
}

/**
 * Drive the start executor's suspended branch (conversation-run.ts shape):
 * sendMessage, capture the first tool_suspended, persist the interrupt, park.
 * Returns the persisted open interrupt (from the mock store's metadata).
 */
async function runStartLegUntilSuspend(harness: {
  controller: Awaited<ReturnType<typeof buildHarness>>["controller"];
  session: Awaited<ReturnType<typeof buildHarness>>["session"];
  scope: AiSessionScope;
  store: AgentSessionStore;
  readMetadata: () => Record<string, unknown>;
  threadId: string;
}) {
  const { session } = harness;
  let suspended: {
    runId: string;
    suspendPayload: unknown;
    toolCallId: string;
  } | null = null;
  let signalInterrupt: () => void = () => undefined;
  const interruptSignal = new Promise<void>((resolve) => {
    signalInterrupt = resolve;
  });
  const unsub = session.subscribe((event) => {
    const e = event as {
      type?: string;
      toolCallId?: string;
      suspendPayload?: unknown;
    };
    if (e.type === "tool_suspended" && !suspended) {
      suspended = {
        runId: session.getCurrentRunId() ?? "",
        suspendPayload: e.suspendPayload,
        toolCallId: e.toolCallId ?? "",
      };
      signalInterrupt();
    }
  });
  const sendDone = session
    .sendMessage({ content: "go" })
    .then(() => "resolved")
    .catch(() => "error");
  await Promise.race([sendDone, interruptSignal]);
  unsub();
  const sus = suspended as {
    runId: string;
    suspendPayload: unknown;
    toolCallId: string;
  } | null;
  if (!sus) {
    throw new Error("expected the first gated tool call to suspend");
  }
  await emitToolApprovalInterrupt({
    busRunId: "bus-run-start",
    emit: () => undefined,
    payload: sus.suspendPayload as ToolApprovalSuspendPayload,
    resumeRunId: sus.runId,
    scope: harness.scope,
    sessionMetadata: harness.readMetadata(),
    store: harness.store,
    threadId: harness.threadId,
    toolCallId: sus.toolCallId,
  });
  parkSessionRun(sus.runId, {
    controller: harness.controller,
    mergedDefinitions: [],
    session,
    threadId: harness.threadId,
  });
  return { sendDone, suspended: sus };
}

function makeMetadataStore() {
  let sessionMetadata: Record<string, unknown> = {};
  const store = {
    updateSessionForUser: async (params: {
      metadata?: Record<string, unknown>;
    }) => {
      sessionMetadata = params.metadata ?? {};
      return {} as never;
    },
  } as unknown as AgentSessionStore;
  return { readMetadata: () => sessionMetadata, store };
}

function collectRunEvents(runId: string) {
  const events: Array<{ outcome?: { type?: string }; type?: string }> = [];
  const unsub = subscribeRunEvents(runId, (e) => {
    events.push(e.event as never);
  });
  return { events, unsub };
}

describe("parallel approval-gated tool calls (sequential HITL chain)", () => {
  it("chains interrupt A -> approve -> interrupt B -> approve -> finish", {
    timeout: 60_000,
  }, async () => {
    const log: string[] = [];
    const { controller, session } = await buildHarness(log);
    const threadId = session.thread.getId() ?? "thread-1";
    const scope: AiSessionScope = { tenantId: "t1", userId: "user-1" };
    const { readMetadata, store } = makeMetadataStore();

    const { sendDone } = await runStartLegUntilSuspend({
      controller,
      readMetadata,
      scope,
      session,
      store,
      threadId,
    });
    const interrupt1 = readAgUiOpenInterrupt(readMetadata());
    expect(interrupt1?.interrupt_id).toBe("tool-approval|op_a");
    expect(interrupt1?.tool_call_id).toBe("call-a");
    expect(interrupt1?.run_id).toBeTruthy();

    // Approve op_a — the continuation must surface the SECOND interrupt.
    const resume1 = collectRunEvents("resume-run-1");
    await resumeConversationRun({
      newRunId: "resume-run-1",
      resolvedToolCallId: interrupt1?.tool_call_id ?? "",
      resumeData: { approved: true, choice_id: "approve_once" },
      scope,
      sessionMetadata: readMetadata(),
      store,
      suspendedRunId: interrupt1?.run_id ?? "",
      threadId,
    });
    resume1.unsub();
    const finished1 = resume1.events.find((e) => e.type === "RUN_FINISHED");
    expect(finished1?.outcome?.type).toBe("interrupt");
    const interrupt2 = readAgUiOpenInterrupt(readMetadata());
    expect(interrupt2?.interrupt_id).toBe("tool-approval|op_b");
    expect(interrupt2?.tool_call_id).toBe("call-b");

    // Approve op_b — the run completes with the interrupt cleared.
    const resume2 = collectRunEvents("resume-run-2");
    await resumeConversationRun({
      newRunId: "resume-run-2",
      resolvedToolCallId: interrupt2?.tool_call_id ?? "",
      resumeData: { approved: true, choice_id: "approve_once" },
      scope,
      sessionMetadata: readMetadata(),
      store,
      suspendedRunId: interrupt2?.run_id ?? "",
      threadId,
    });
    resume2.unsub();
    const finished2 = resume2.events.find((e) => e.type === "RUN_FINISHED");
    expect(finished2).toBeTruthy();
    expect(finished2?.outcome).toBeUndefined();
    expect(resume2.events.some((e) => e.type === "RUN_ERROR")).toBe(false);
    expect(readAgUiOpenInterrupt(readMetadata())).toBeNull();
    expect(log).toEqual([
      "op_a:gate",
      "op_a:approved",
      "op_b:gate",
      "op_b:approved",
    ]);
    await expect(
      Promise.race([
        sendDone,
        new Promise<string>((r) => setTimeout(() => r("pending"), 5000)),
      ])
    ).resolves.toBe("resolved");
    await controller.destroy().catch(() => undefined);
  });

  it("a resume for a tool call that is not suspended errors and keeps the park", {
    timeout: 60_000,
  }, async () => {
    const log: string[] = [];
    const { controller, session } = await buildHarness(log);
    const threadId = session.thread.getId() ?? "thread-1";
    const scope: AiSessionScope = { tenantId: "t1", userId: "user-1" };
    const { readMetadata, store } = makeMetadataStore();

    await runStartLegUntilSuspend({
      controller,
      readMetadata,
      scope,
      session,
      store,
      threadId,
    });
    const interrupt1 = readAgUiOpenInterrupt(readMetadata());

    // A duplicate/stale approval names a tool call Mastra has NOT parked
    // (call-b has not suspended yet). This must be a terminal RUN_ERROR —
    // NOT a silent success that clears the interrupt and destroys the park.
    const staleResume = collectRunEvents("resume-run-stale");
    await resumeConversationRun({
      newRunId: "resume-run-stale",
      resolvedToolCallId: "call-b",
      resumeData: { approved: true, choice_id: "approve_once" },
      scope,
      sessionMetadata: readMetadata(),
      store,
      suspendedRunId: interrupt1?.run_id ?? "",
      threadId,
    });
    staleResume.unsub();
    expect(staleResume.events.some((e) => e.type === "RUN_ERROR")).toBe(true);
    // The open interrupt survived the failed resume.
    expect(readAgUiOpenInterrupt(readMetadata())?.interrupt_id).toBe(
      "tool-approval|op_a"
    );

    // The park survived too: the REAL approval still resumes the chain.
    const resume1 = collectRunEvents("resume-run-after-stale");
    await resumeConversationRun({
      newRunId: "resume-run-after-stale",
      resolvedToolCallId: "call-a",
      resumeData: { approved: true, choice_id: "approve_once" },
      scope,
      sessionMetadata: readMetadata(),
      store,
      suspendedRunId: interrupt1?.run_id ?? "",
      threadId,
    });
    resume1.unsub();
    const finished = resume1.events.find((e) => e.type === "RUN_FINISHED");
    expect(finished?.outcome?.type).toBe("interrupt");
    expect(readAgUiOpenInterrupt(readMetadata())?.interrupt_id).toBe(
      "tool-approval|op_b"
    );
    expect(log).toContain("op_a:approved");
    await controller.destroy().catch(() => undefined);
  });
});
