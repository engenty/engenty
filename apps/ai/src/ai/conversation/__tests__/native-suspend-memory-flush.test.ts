// Who persists the assistant turn when a run parks on a NATIVE Mastra suspend.
//
// `persistTurnTranscript` exists because an interrupted turn used to leave the
// thread empty: memory flushed only at end-of-generation, so a decision card
// (which ABORTED the run) wrote nothing and the next turn re-asked the question.
// `requestDecision` no longer aborts — it suspends (native-request-decision.ts),
// and a suspend keeps the turn inside Mastra.
//
// So the executor's safety-net write is only correct while memory really writes
// nothing. This pins the opposite: Mastra flushes the assistant message when the
// run parks, which means a second write from the executor DUPLICATES the turn —
// the same tool call persisted twice, once as `tool-invocation` (memory) and
// once as `dynamic-tool` (us), rendering two "Decision needed" cards.
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
const THREAD_ID = "thread-native-suspend-flush";
const RESOURCE_ID = "user-1";
const TOOL_CALL_ID = "call-decide";
const SECOND_TOOL_CALL_ID = "call-decide-2";

function suspendingDecisionTool() {
  return createTool({
    id: "requestDecision",
    description: "ask the user to choose",
    inputSchema: z.object({ title: z.string().optional() }),
    resumeSchema: z.object({ choice_id: z.string().optional() }),
    execute: async (_input, ctx) => {
      // Mirrors native-request-decision.ts: a resume re-enters `execute` and the
      // user's answer becomes this tool's own result, which is what lets the
      // agent loop continue instead of parking straight back.
      const resume = ctx.agent?.resumeData as
        | { choice_id?: string }
        | undefined;
      if (resume) {
        return `The user selected: ${resume.choice_id ?? "?"}` as never;
      }
      await ctx.agent?.suspend({
        artifact_id: "decision-1",
        artifact_type: "decision",
      });
      return undefined as never;
    },
  });
}

function toolCallingModel() {
  return new MockLanguageModelV3({
    doStream: (async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "stream-start", warnings: [] },
          {
            input: JSON.stringify({ title: "which project?" }),
            toolCallId: TOOL_CALL_ID,
            toolName: "requestDecision",
            type: "tool-call",
          },
          { finishReason: "tool-calls", type: "finish", usage },
        ],
      }),
    })) as never,
  });
}

/** Text first, then a second suspending call — the re-suspend shape. */
function talkThenSuspendModel() {
  return new MockLanguageModelV3({
    doStream: (async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "stream-start", warnings: [] },
          { id: "t1", type: "text-start" },
          { delta: "arbeite daran", id: "t1", type: "text-delta" },
          { id: "t1", type: "text-end" },
          {
            input: JSON.stringify({ title: "und jetzt?" }),
            toolCallId: SECOND_TOOL_CALL_ID,
            toolName: "requestDecision",
            type: "tool-call",
          },
          { finishReason: "tool-calls", type: "finish", usage },
        ],
      }),
    })) as never,
  });
}

async function assistantMessages(memory: Memory) {
  const recalled = (await (
    memory as unknown as {
      recall: (args: unknown) => Promise<{ messages: unknown[] }>;
    }
  ).recall({
    resourceId: RESOURCE_ID,
    threadConfig: { lastMessages: 40 },
    threadId: THREAD_ID,
  })) as { messages: { role?: string }[] };
  return recalled.messages.filter((message) => message.role === "assistant");
}

function buildAgent(memory: Memory, storage: InMemoryStore, model: unknown) {
  return new Agent({
    id: "suspend-flush",
    instructions: "test",
    mastra: new Mastra({ storage } as never),
    memory: memory as never,
    model: model as never,
    name: "suspend-flush",
    tools: { requestDecision: suspendingDecisionTool() },
  } as never);
}

async function drain(stream: unknown) {
  for await (const _chunk of (stream as { fullStream: AsyncIterable<unknown> })
    .fullStream) {
    // drain until the run parks
  }
}

describe("a native suspend and Mastra memory", () => {
  it("flushes the assistant turn when the run parks", async () => {
    const storage = new InMemoryStore();
    const memory = new Memory({
      options: { semanticRecall: false, workingMemory: { enabled: false } },
      storage,
    });
    const agent = buildAgent(memory, storage, toolCallingModel());

    await drain(
      await agent.stream("las mich aus einem wählen", {
        memory: { resource: RESOURCE_ID, thread: THREAD_ID },
        runId: "run-suspend-1",
      } as never)
    );

    const assistant = await assistantMessages(memory);
    expect(assistant.length).toBeGreaterThan(0);
    // The suspended call itself is in there — so an executor-side write of the
    // same transcript is a duplicate, not a safety net.
    expect(JSON.stringify(assistant)).toContain(TOOL_CALL_ID);
  });

  it("flushes the continuation too when a RESUME parks again", async () => {
    // The resume lanes inherited the same assumption, and the snapshot lane
    // deliberately gives its re-assembled agent a memory instance — so a
    // continuation that ends on a SECOND suspend is flushed as well, and its
    // post-run pass must stand down exactly like the start lane's.
    const storage = new InMemoryStore();
    const memory = new Memory({
      options: { semanticRecall: false, workingMemory: { enabled: false } },
      storage,
    });
    const runId = "run-suspend-2";
    await drain(
      await buildAgent(memory, storage, toolCallingModel()).stream("go", {
        memory: { resource: RESOURCE_ID, thread: THREAD_ID },
        runId,
      } as never)
    );

    // The restart shape: a fresh Agent over the same storage, as the snapshot
    // lane assembles it.
    const resumed = buildAgent(memory, storage, talkThenSuspendModel());
    await drain(
      await resumed.resumeStream({ choice_id: "tl-300" }, {
        memory: { resource: RESOURCE_ID, thread: THREAD_ID },
        runId,
        toolCallId: TOOL_CALL_ID,
        untilIdle: true,
      } as never)
    );

    const written = JSON.stringify(await assistantMessages(memory));
    expect(written).toContain("arbeite daran");
    expect(written).toContain(SECOND_TOOL_CALL_ID);
  });
});
