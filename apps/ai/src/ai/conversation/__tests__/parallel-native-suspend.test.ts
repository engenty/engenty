// Native tool-approval suspension at @mastra/core 1.61 — the shape interactive
// chat gates on (`approvalPolicy: "suspend"`, lib/execute-approval.ts).
//
// APPROVALS ARE SEQUENTIAL BY DESIGN, not by defect. A gated call parks the turn,
// and a second gated call in the SAME step never executes. That is correct: a
// person answers one approval card at a time, and every harness UI shows one at a
// time. These tests pin it so it is not "fixed" again — the tree once spent a
// release working around it, and the workaround (returning the Approve/Deny card
// as a tool RESULT) cannot be mapped to a canonical AG-UI interrupt.
//
// SCOPE: this harness proves the SUSPEND half only. Driving a resume through it
// never re-runs the tool, so resume is proven against a real model instead —
// packages/ag-ui-bridge/live-probes/interactive-run.mjs.
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
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

const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };

/**
 * Mirrors `engenty_tool_execute` under `approvalPolicy: "suspend"`: the gate calls
 * `context.agent.suspend(payload)` from inside execute, and on resume the same
 * execute re-runs with `resumeData` populated.
 */
function makeAgentSuspendingGate(id: string, log: string[]) {
  return createTool({
    id,
    description: `gate ${id}`,
    inputSchema: z.object({ q: z.string().optional() }),
    resumeSchema: z.object({ approved: z.boolean() }),
    execute: async (input, context) => {
      const op = (input as { q?: string })?.q ?? "?";
      // BOTH live under `.agent` — `agent.suspend` parks, `agent.resumeData`
      // carries the answer back (run-context.ts:170, engenty-tool-execute-tool.ts:180).
      const ctx = context as {
        agent?: {
          resumeData?: { approved?: boolean };
          suspend?: (payload: unknown) => Promise<unknown>;
        };
      };
      const resumeData = ctx?.agent?.resumeData;
      if (resumeData?.approved !== undefined) {
        log.push(`resumed:${op}:${resumeData.approved}`);
        return { approved: resumeData.approved, op };
      }
      const suspend = ctx?.agent?.suspend;
      if (!suspend) {
        log.push(`no-suspend:${op}`);
        return { error: "no agent.suspend in context" };
      }
      log.push(`suspend:${op}`);
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

async function buildHarness(log: string[], toolCalls: number) {
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
            ...(toolCalls > 1
              ? [
                  {
                    type: "tool-call",
                    toolCallId: "call-b",
                    toolName: "engenty_gate",
                    input: JSON.stringify({ q: "op_b" }),
                  },
                ]
              : []),
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
    name: "parallel-native-suspend",
    instructions: "test",
    model: model as never,
    tools: { engenty_gate: makeAgentSuspendingGate("engenty_gate", log) },
  } as never);
  const memory = new Memory({
    storage: new InMemoryStore(),
    options: { semanticRecall: false, workingMemory: { enabled: false } },
  });
  const basePath = path.join(tmpdir(), "parallel-native-suspend");
  mkdirSync(basePath, { recursive: true });
  const controller = new AgentController({
    agent,
    defaultModeId: "default",
    id: `native-suspend-${Math.random().toString(36).slice(2)}`,
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
      name: "suspend-ws",
    }),
  });
  // `yolo` disables Mastra's per-tool-NAME gate, which is structurally too coarse
  // for one generic engenty_tool_execute (controller-session.ts). Our gate stays
  // ours; only the parking mechanism is Mastra's.
  await session.state.set({ yolo: true });
  return { controller, session };
}

function watch(session: {
  subscribe: (fn: (e: unknown) => void) => () => void;
}) {
  const suspended: string[] = [];
  const errors: string[] = [];
  const unsub = session.subscribe((event) => {
    const e = event as {
      type?: string;
      toolCallId?: string;
      error?: { message?: string };
    };
    if (e.type === "tool_suspended") {
      suspended.push(e.toolCallId ?? "?");
    }
    if (e.type === "error") {
      errors.push(e.error?.message ?? "run error");
    }
  });
  return { errors, suspended, unsub };
}

describe("native tool-approval suspension (Mastra 1.61)", () => {
  it("a gated call suspends natively", { timeout: 60_000 }, async () => {
    const log: string[] = [];
    const { session } = await buildHarness(log, 1);
    const { errors, suspended, unsub } = watch(session as never);

    await (
      session as never as { sendMessage: (m: unknown) => Promise<unknown> }
    ).sendMessage({ content: "go" });
    unsub();

    expect(log).toContain("suspend:op_a");
    // The event the AG-UI bridge maps to a canonical interrupt.
    expect(suspended).toEqual(["call-a"]);
    expect(errors).toEqual([]);
  });

  it("a SECOND gated call in the same step does not execute while the first is parked", {
    timeout: 60_000,
  }, async () => {
    // The invariant the artifact policy was built to dodge, and which makes that
    // workaround unnecessary: there is never more than one suspension per step,
    // so the 1.52 shared-step resume bug is unreachable.
    const log: string[] = [];
    const { session } = await buildHarness(log, 2);
    const { errors, suspended, unsub } = watch(session as never);

    await (
      session as never as { sendMessage: (m: unknown) => Promise<unknown> }
    ).sendMessage({ content: "go" });
    unsub();

    expect(log).toContain("suspend:op_a");
    // Not merely "did not suspend" — op_b's execute was never entered at all.
    expect(log).not.toContain("suspend:op_b");
    expect(log).not.toContain("no-suspend:op_b");
    expect(suspended).toEqual(["call-a"]);
    expect(errors).toEqual([]);
  });
});
