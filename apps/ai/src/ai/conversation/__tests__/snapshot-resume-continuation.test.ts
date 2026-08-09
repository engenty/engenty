// The Mastra contract the SNAPSHOT resume lane is built on, pinned against the
// real runtime (no mocked agent). `resumeFromSnapshot` continues a suspended run
// from workflow-snapshot storage with a BRAND-NEW Agent — what a server restart
// leaves us with — via `resumeStream(resumeData, { runId, untilIdle, toolCallId })`.
//
// Two facts it depends on, both of which a Mastra upgrade could silently change:
//
//  1. The resume really re-enters the agentic loop: the suspended tool returns
//     its result AND the model is called again for the continuation.
//  2. When that continuation suspends AGAIN (the normal shape here — the resume
//     runs under `approvalPolicy: "suspend"`, so any gated tool parks the run),
//     Mastra reports it as a `tool-call-suspended` chunk and ENDS the stream.
//     There is no `tool-call` chunk for it and no text, so a lane that only
//     converts text/tool chunks sees a run that finished with nothing to say.
//     That is exactly the empty continuation this test exists to prevent.
import { Agent } from "@mastra/core/agent";
import { Mastra } from "@mastra/core/mastra";
import { InMemoryStore } from "@mastra/core/storage";
import { createTool } from "@mastra/core/tools";
import { Memory } from "@mastra/memory";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };
const THREAD_ID = "thread-snapshot-resume";
const RESOURCE_ID = "user-1";
const TOOL_CALL_ID = "call-decide";

/**
 * Stand-in for `requestDecision` under `canSuspendForInteraction`: suspends the
 * run with a decision artifact, and on resume returns the user's answer as its
 * own tool result — the shape in
 * apps/ai/ai/tools/request-decision/native-request-decision.ts.
 */
function makeSuspendingDecisionTool(log: string[]) {
  return createTool({
    id: "requestDecision",
    description: "ask the user to choose",
    inputSchema: z.object({ question: z.string().optional() }),
    resumeSchema: z.object({
      cancelled: z.boolean().optional(),
      choice_id: z.string().optional(),
      choice_label: z.string().optional(),
      text: z.string().optional(),
    }),
    execute: async (_input, ctx) => {
      const resume = ctx.agent?.resumeData as
        | { choice_id?: string; choice_label?: string }
        | undefined;
      if (resume) {
        log.push(`resumed:${resume.choice_id ?? resume.choice_label ?? "?"}`);
        return `The user selected: ${
          resume.choice_label ?? resume.choice_id ?? "?"
        }` as never;
      }
      log.push("suspended");
      await ctx.agent?.suspend({
        artifact_id: "decision-1",
        artifact_type: "decision",
      });
      return undefined as never;
    },
  });
}

/**
 * `callsTool: true` — turn 1 invokes the decision tool. `false` — every turn is
 * a plain text answer, which is what the RESUMED agent's model must do, since a
 * new Agent instance starts its call counter over.
 */
function makeModel(turns: string[], callsTool: boolean) {
  let call = 0;
  const doStream = async () => {
    call += 1;
    turns.push(`llm-call-${call}`);
    if (call === 1 && callsTool) {
      return {
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start", warnings: [] },
            {
              input: JSON.stringify({ question: "which one?" }),
              toolCallId: TOOL_CALL_ID,
              toolName: "requestDecision",
              type: "tool-call",
            },
            { finishReason: "tool-calls", type: "finish", usage },
          ],
        }),
      };
    }
    return {
      stream: simulateReadableStream({
        chunks: [
          { type: "stream-start", warnings: [] },
          { id: "t1", type: "text-start" },
          { delta: "continuation-text", id: "t1", type: "text-delta" },
          { id: "t1", type: "text-end" },
          { finishReason: "stop", type: "finish", usage },
        ],
      }),
    };
  };
  return new MockLanguageModelV3({ doStream: doStream as never });
}

interface Harness {
  log: string[];
  mastra: Mastra;
  memory: Memory;
}

function buildHarness(): Harness {
  const storage = new InMemoryStore();
  const memory = new Memory({
    options: { semanticRecall: false, workingMemory: { enabled: false } },
    storage,
  });
  // Storage on the Mastra instance is what makes the agentic-loop snapshot
  // durable — the whole premise of this lane.
  const mastra = new Mastra({ storage } as never);
  return { log: [], mastra, memory };
}

/** Run 1: suspend inside the decision tool. Returns the suspended runId. */
async function runUntilSuspended(h: Harness): Promise<string> {
  const runId = `run-${h.log.length}-suspend`;
  const agent = new Agent({
    id: "snapshot-repro",
    instructions: "test",
    mastra: h.mastra,
    // Production parity: the START lane's agent gets memory from its
    // AgentController (`agent.__setMemory`), so run 1 always has it.
    memory: h.memory as never,
    model: makeModel([], true) as never,
    name: "snapshot-repro",
    tools: { requestDecision: makeSuspendingDecisionTool(h.log) },
  } as never);
  const stream = await agent.stream("go", {
    memory: { resource: RESOURCE_ID, thread: THREAD_ID },
    runId,
  } as never);
  for await (const _chunk of (
    stream as unknown as { fullStream: AsyncIterable<unknown> }
  ).fullStream) {
    // drain
  }
  return runId;
}

/** The restart: a new Agent over the same storage, assembled as this lane does. */
function assembleResumedAgent(h: Harness, turns: string[], callsTool: boolean) {
  return new Agent({
    id: "snapshot-repro",
    instructions: "test",
    mastra: h.mastra,
    model: makeModel(turns, callsTool) as never,
    name: "snapshot-repro",
    tools: { requestDecision: makeSuspendingDecisionTool(h.log) },
  } as never);
}

function resume(agent: Agent, runId: string) {
  return agent.resumeStream({ choice_id: "opt-a", choice_label: "Option A" }, {
    memory: { resource: RESOURCE_ID, thread: THREAD_ID },
    runId,
    toolCallId: TOOL_CALL_ID,
    untilIdle: true,
  } as never);
}

async function collect(stream: unknown) {
  const chunks: Array<{ payload?: Record<string, unknown>; type?: string }> =
    [];
  for await (const chunk of (stream as { fullStream: AsyncIterable<never> })
    .fullStream) {
    chunks.push(chunk);
  }
  return chunks;
}

describe("Mastra's snapshot resume contract", () => {
  it("re-enters the agent loop after the resumed tool returns", {
    timeout: 60_000,
  }, async () => {
    const h = buildHarness();
    const suspendedRunId = await runUntilSuspended(h);
    expect(h.log).toEqual(["suspended"]);

    const turns: string[] = [];
    const agent = assembleResumedAgent(h, turns, false);
    const { runs } = await agent.listSuspendedRuns({ threadId: THREAD_ID });
    expect(runs.map((run) => run.runId)).toContain(suspendedRunId);

    const chunks = await collect(await resume(agent, suspendedRunId));
    const text = chunks
      .filter((c) => c.type === "text-delta")
      .map((c) => String(c.payload?.text ?? ""))
      .join("");

    // The tool re-entered with the user's answer and produced its result...
    expect(h.log).toContain("resumed:opt-a");
    // ...and the model was called again, so the user gets a real answer.
    expect(turns.length).toBeGreaterThan(0);
    expect(text).toContain("continuation-text");
  });

  it("signals a second suspend with `tool-call-suspended` and no tool-call chunk", {
    timeout: 60_000,
  }, async () => {
    const h = buildHarness();
    const suspendedRunId = await runUntilSuspended(h);

    // A fresh call counter makes this model reach for the gated tool again —
    // the same thing a real continuation does under `approvalPolicy: "suspend"`.
    const agent = assembleResumedAgent(h, [], true);
    const chunks = await collect(await resume(agent, suspendedRunId));
    const types = chunks.map((c) => c.type);

    // The first tool's result still lands, then the loop parks again.
    expect(types).toContain("tool-result");
    expect(types).toContain("tool-call-suspended");
    // The trap: no `tool-call` and no text for the newly suspended call, so a
    // converter alone cannot render it — the lane MUST read this chunk and
    // raise the interrupt itself (see resume-conversation-run.ts).
    expect(types).not.toContain("tool-call");
    expect(types).not.toContain("text-delta");
    expect(h.log).toEqual(["suspended", "resumed:opt-a", "suspended"]);

    // The payload shape `readSuspendedToolChunk` parses.
    const suspend = chunks.find((c) => c.type === "tool-call-suspended");
    expect(suspend?.payload).toMatchObject({
      suspendPayload: { artifact_type: "decision" },
      toolCallId: TOOL_CALL_ID,
      toolName: "requestDecision",
    });
  });
});
