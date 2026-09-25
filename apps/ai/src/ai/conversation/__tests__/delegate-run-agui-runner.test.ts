// The headless runner driven through a REAL MastraAgent, not the pure mapper.
//
// Each of these fails silently rather than loudly: usage, thread/resource
// binding, cancellation, requestContext, mid-flight steering.
import { Agent } from "@mastra/core/agent";
import { RequestContext } from "@mastra/core/request-context";
import { InMemoryStore } from "@mastra/core/storage";
import { createTool } from "@mastra/core/tools";
import { Memory } from "@mastra/memory";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  AGENT_THREADS_EMPTY_REPLY,
  AGENT_THREADS_STEP_LIMIT_REACHED,
} from "../../sessions/mastra-stream-failure.js";
import {
  workspaceApprovalTitle,
  workspaceToolGrantId,
} from "../../workspace/workspace-tool-guards.js";
import { runHeadlessViaMastraAgent } from "../delegate-run-agui-driver.js";

const usage = { inputTokens: 11, outputTokens: 7, totalTokens: 18 };

function textAgent(text = "done") {
  return new Agent({
    name: "headless-runner",
    instructions: "test",
    model: new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "t1" },
            { type: "text-delta", id: "t1", delta: text },
            { type: "text-end", id: "t1" },
            { type: "finish", finishReason: "stop", usage },
          ],
        }),
      }),
    } as never) as never,
    storage: new InMemoryStore(),
  } as never);
}

function run(agent: unknown, extra: Record<string, unknown> = {}) {
  return runHeadlessViaMastraAgent({
    agent,
    agentId: "headless-runner",
    content: "go",
    describeCall: workspaceApprovalTitle,
    grantIdOf: workspaceToolGrantId,
    resourceId: "resource-1",
    runId: "run-1",
    sinks: {},
    threadId: "thread-1",
    ...extra,
  });
}

describe("headless MastraAgent runner", () => {
  it("5b: surfaces provider usage from RUN_FINISHED", async () => {
    // The Session path read usage off our converter. @ag-ui/mastra attaches it to
    // RUN_FINISHED instead — on a field the AG-UI 0.0.58 schema does not declare,
    // which survives only because the schemas pass unknown keys through. If that
    // ever tightens upstream, billing goes quietly to zero, so this pins it.
    const outcome = await run(textAgent());
    expect(outcome.usage).not.toBeNull();
    expect(outcome.usage?.[0]).toMatchObject({
      inputTokens: 11,
      outputTokens: 7,
    });
  });

  it("5b: text still assembles alongside usage", async () => {
    const outcome = await run(textAgent("hello world"));
    expect(outcome.finalText).toBe("hello world");
    expect(outcome.streamError).toBeNull();
  });

  it("5d: an already-aborted signal never starts the run", async () => {
    // The Session path checked `aborted` BEFORE driving. Without it a cancelled
    // task job still burns a model call.
    const doStream = vi.fn(async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "stream-start", warnings: [] },
          { type: "finish", finishReason: "stop", usage },
        ],
      }),
    }));
    const agent = new Agent({
      name: "headless-runner",
      instructions: "test",
      model: new MockLanguageModelV3({ doStream: doStream as never }) as never,
      storage: new InMemoryStore(),
    } as never);

    const controller = new AbortController();
    controller.abort();
    const outcome = await run(agent, { abortSignal: controller.signal });

    expect(doStream).not.toHaveBeenCalled();
    expect(outcome.usage).toBeNull();
    expect(outcome.finalText).toBe("");
  });

  it("5d: releases the live-session hook on every exit path", async () => {
    // A leaked registration on a long-running task job is a real leak — the
    // registry would keep routing comments at a run that already ended.
    const release = vi.fn();
    await run(textAgent(), { onLiveSession: () => release });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("5d: releases it even when the run throws", async () => {
    const release = vi.fn();
    const exploding = new Agent({
      name: "headless-runner",
      instructions: "test",
      model: new MockLanguageModelV3({
        doStream: async () => {
          throw new Error("gateway 402");
        },
      } as never) as never,
      storage: new InMemoryStore(),
    } as never);

    const outcome = await run(exploding, { onLiveSession: () => release });

    expect(release).toHaveBeenCalledTimes(1);
    // A stream failure is a FAILED run, not a thrown call — same contract as the
    // Session path, whose caller turns streamError into the outcome.
    expect(outcome.streamError).toBeTruthy();
  });

  it("5f: a steering failure degrades to a progress line, never kills the run", async () => {
    // The Agent message/signal API is @experimental upstream. If it moves, a task
    // comment should be lost — not the whole run.
    const lines: string[] = [];
    let deliver: ((c: string) => Promise<void>) | null = null;
    const outcome = await run(textAgent(), {
      onLiveSession: (io: { deliver: (c: string) => Promise<void> }) => {
        deliver = io.deliver;
        return;
      },
      sinks: { onProgress: (l: string) => lines.push(l) },
    });

    expect(deliver).toBeTypeOf("function");
    // This agent has no active run any more, so delivery cannot succeed. It must
    // resolve rather than reject.
    await expect(
      (deliver as never as (c: string) => Promise<void>)("late comment")
    ).resolves.toBeUndefined();
    expect(outcome.finalText).toBe("done");
  });
});

describe("thread binding", () => {
  it("writes the turn to the thread it was given, not a default", async () => {
    // The plan called for PROOF, not "by construction". The Session path needed an
    // explicit `thread.switch` because `createSession` binds to the "most recent
    // thread" — never the one a delegated child must write to. Here the thread is a
    // constructor argument, but that only helps if it is actually honoured.
    const memory = new Memory({
      storage: new InMemoryStore(),
      options: { semanticRecall: false, workingMemory: { enabled: false } },
    });
    const agent = new Agent({
      name: "headless-runner",
      instructions: "test",
      memory: memory as never,
      model: new MockLanguageModelV3({
        doStream: async () => ({
          stream: simulateReadableStream({
            chunks: [
              { type: "stream-start", warnings: [] },
              { type: "text-start", id: "t1" },
              { type: "text-delta", id: "t1", delta: "bound" },
              { type: "text-end", id: "t1" },
              { type: "finish", finishReason: "stop", usage },
            ],
          }),
        }),
      } as never) as never,
      storage: new InMemoryStore(),
    } as never);

    const outcome = await runHeadlessViaMastraAgent({
      agent,
      agentId: "headless-runner",
      content: "remember this",
      describeCall: workspaceApprovalTitle,
      grantIdOf: workspaceToolGrantId,
      resourceId: "resource-9",
      runId: "run-9",
      sinks: {},
      threadId: "thread-9",
    });
    expect(outcome.finalText).toBe("bound");

    // The thread the run was told to use is the one that exists afterwards. A null
    // here would mean the run wrote somewhere else — the exact failure
    // `thread.switch` existed to prevent on the Session path.
    const thread = await memory.getThreadById({ threadId: "thread-9" });
    expect(thread).not.toBeNull();
    expect(thread?.id).toBe("thread-9");
    expect(thread?.resourceId).toBe("resource-9");
  });
});

describe("requestContext", () => {
  it("reaches the tool that executes inside the run", async () => {
    // The most security-relevant of the five: requestContext carries tenant, space
    // and agent identity. If it does not arrive, tools run without the isolation
    // boundary they assume — which is not the kind of thing to take on faith.
    let seenTenant: unknown;
    const probe = createTool({
      id: "probe",
      description: "records the request context it ran under",
      inputSchema: z.object({}),
      execute: async (_input, context) => {
        const rc = (
          context as { requestContext?: { get?: (k: string) => unknown } }
        )?.requestContext;
        seenTenant = rc?.get?.("tenant-id");
        return { ok: true };
      },
    });

    let call = 0;
    const agent = new Agent({
      name: "headless-runner",
      instructions: "test",
      model: new MockLanguageModelV3({
        doStream: async () => {
          call += 1;
          return call === 1
            ? {
                stream: simulateReadableStream({
                  chunks: [
                    { type: "stream-start", warnings: [] },
                    {
                      type: "tool-call",
                      toolCallId: "c1",
                      toolName: "probe",
                      input: "{}",
                    },
                    { type: "finish", finishReason: "tool-calls", usage },
                  ],
                }),
              }
            : {
                stream: simulateReadableStream({
                  chunks: [
                    { type: "stream-start", warnings: [] },
                    { type: "text-start", id: "t1" },
                    { type: "text-delta", id: "t1", delta: "ok" },
                    { type: "text-end", id: "t1" },
                    { type: "finish", finishReason: "stop", usage },
                  ],
                }),
              };
        },
      } as never) as never,
      storage: new InMemoryStore(),
      tools: { probe },
    } as never);

    const requestContext = new RequestContext();
    requestContext.set("tenant-id", "tenant-abc");

    await runHeadlessViaMastraAgent({
      agent,
      agentId: "headless-runner",
      content: "probe it",
      describeCall: workspaceApprovalTitle,
      grantIdOf: workspaceToolGrantId,
      requestContext,
      resourceId: "resource-1",
      runId: "run-ctx",
      sinks: {},
      threadId: "thread-ctx",
    });

    expect(seenTenant).toBe("tenant-abc");
  });
});

describe("window occupancy on a multi-step run", () => {
  it("reports the LAST call's input, while usage keeps the billed total", async () => {
    // RUN_FINISHED.usage arrives as ONE aggregated entry, so reading "the last
    // entry" there gave the run total — every direct-run row carried the sum as
    // its window. The stream's own steps hold the per-call numbers.
    let calls = 0;
    const lookup = createTool({
      description: "lookup",
      execute: async () => ({ ok: true }),
      id: "lookup",
      inputSchema: z.object({}),
    });
    const agent = new Agent({
      instructions: "test",
      model: new MockLanguageModelV3({
        doStream: async () => {
          calls += 1;
          const stepUsage = {
            inputTokens: 100 * calls,
            outputTokens: 5,
            totalTokens: 100 * calls + 5,
          };
          return {
            stream: simulateReadableStream({
              chunks: (calls === 1
                ? [
                    { type: "stream-start", warnings: [] },
                    {
                      input: "{}",
                      toolCallId: "c1",
                      toolName: "lookup",
                      type: "tool-call",
                    },
                    {
                      finishReason: "tool-calls",
                      type: "finish",
                      usage: stepUsage,
                    },
                  ]
                : [
                    { type: "stream-start", warnings: [] },
                    { id: "t1", type: "text-start" },
                    { delta: "done", id: "t1", type: "text-delta" },
                    { id: "t1", type: "text-end" },
                    {
                      finishReason: "stop",
                      type: "finish",
                      usage: stepUsage,
                    },
                  ]) as never,
            }),
          };
        },
      } as never) as never,
      name: "two-step",
      storage: new InMemoryStore(),
      tools: { lookup },
    } as never);

    const outcome = await run(agent, { maxSteps: 5 });

    expect(calls).toBe(2);
    expect(outcome.windowInputTokens).toBe(200);
    expect(
      outcome.usage?.reduce((sum, u) => sum + (u.inputTokens ?? 0), 0)
    ).toBe(300);
  });
});

describe("named silent finishes on the headless lane", () => {
  it("fails a run whose model stayed silent after the nudge, by name", async () => {
    // Text-less stop: the empty-reply completion check gives the model one more
    // step; still nothing → the run must not read as "completed, no output".
    const agent = new Agent({
      instructions: "test",
      model: new MockLanguageModelV3({
        doStream: async () => ({
          stream: simulateReadableStream({
            chunks: [
              { type: "stream-start", warnings: [] },
              { finishReason: "stop", type: "finish", usage },
            ],
          }),
        }),
      } as never) as never,
      name: "silent",
      storage: new InMemoryStore(),
    } as never);

    const outcome = await run(agent);

    expect(outcome.finalText).toBe("");
    expect(outcome.streamError).toBe(AGENT_THREADS_EMPTY_REPLY);
  });

  it("names the step cap when the last allowed step still wanted a tool", async () => {
    const lookup = createTool({
      description: "always more",
      execute: async () => ({ ok: true }),
      id: "lookup",
      inputSchema: z.object({}),
    });
    const agent = new Agent({
      instructions: "test",
      model: new MockLanguageModelV3({
        doStream: async () => ({
          stream: simulateReadableStream({
            chunks: [
              { type: "stream-start", warnings: [] },
              {
                input: "{}",
                toolCallId: `call-${Math.random()}`,
                toolName: "lookup",
                type: "tool-call",
              },
              { finishReason: "tool-calls", type: "finish", usage },
            ],
          }),
        }),
      } as never) as never,
      name: "step-cap",
      storage: new InMemoryStore(),
      tools: { lookup },
    } as never);

    const outcome = await run(agent, { maxSteps: 2 });

    expect(outcome.streamError).toBe(AGENT_THREADS_STEP_LIMIT_REACHED);
  });
});
