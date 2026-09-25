// Does `engentyToolsRunAls` survive into TOOL EXECUTION under the AG-UI driver?
//
// "Do tools get called" is the easy question and not the dangerous one. Every
// engenty tool reads its run context from an AsyncLocalStorage:
//
//     getEngentyToolsRunContext() => engentyToolsRunAls.getStore() ?? {}
//
// It returns `{}` when the store is missing — no throw, no warning. And the gate reads
// `ctx.approvalPolicy ?? "deny"`. So if ALS does not propagate across
// `agent.stream()` and the Observable that wraps it, every gated operation in every
// headless run is SILENTLY denied, and the only symptom is agents that mysteriously
// cannot do anything.
//
// The live flow-draft comparison could not answer this: a real model authoring a flow
// made 4 tool calls one run and 1 the next, so a zero proves nothing. This forces the
// tool call with a mock model instead, which is the only way to get a straight answer.
import { Agent } from "@mastra/core/agent";
import { InMemoryStore } from "@mastra/core/storage";
import { createTool } from "@mastra/core/tools";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  engentyToolsRunAls,
  getEngentyToolsRunContext,
} from "../../../../ai/tools/engenty-tools/lib/run-context.js";
import {
  workspaceApprovalTitle,
  workspaceToolGrantId,
} from "../../workspace/workspace-tool-guards.js";
import { runHeadlessViaMastraAgent } from "../delegate-run-agui-driver.js";

const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };

/** Records the ALS context it executed under — the whole point of the fixture. */
function makeContextProbeTool(seen: Record<string, unknown>[]) {
  return createTool({
    id: "context_probe",
    description: "records its engenty run context",
    inputSchema: z.object({}),
    execute: async () => {
      seen.push({ ...getEngentyToolsRunContext() });
      return { ok: true };
    },
  });
}

function probeAgent(seen: Record<string, unknown>[]) {
  let call = 0;
  return new Agent({
    name: "als-probe",
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
                    toolName: "context_probe",
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
    tools: { context_probe: makeContextProbeTool(seen) },
  } as never);
}

function drive(seen: Record<string, unknown>[]) {
  return runHeadlessViaMastraAgent({
    agent: probeAgent(seen),
    agentId: "als-probe",
    content: "probe",
    describeCall: workspaceApprovalTitle,
    grantIdOf: workspaceToolGrantId,
    resourceId: "resource-1",
    runId: "run-als",
    sinks: {},
    threadId: "thread-als",
  });
}

describe("engentyToolsRunAls under the AG-UI driver", () => {
  it("reaches tool execution through agent.stream() and the Observable", async () => {
    const seen: Record<string, unknown>[] = [];
    await engentyToolsRunAls.run(
      {
        agentTypeKey: "als-probe",
        approvalPolicy: "suspend",
        approvalGrants: ["op_a"],
      } as never,
      async () => {
        await drive(seen);
      }
    );

    // The tool ran at all — otherwise everything below is vacuously true.
    expect(seen).toHaveLength(1);
    // And it ran INSIDE the store. An empty object here is the silent-denial bug:
    // approvalPolicy would fall back to "deny" and every gated op would fail with
    // no error anyone could see.
    expect(seen[0]?.approvalPolicy).toBe("suspend");
    expect(seen[0]?.agentTypeKey).toBe("als-probe");
    expect(seen[0]?.approvalGrants).toEqual(["op_a"]);
  });

  it("CONTROL: the same run outside the store sees an empty context", async () => {
    // Proves the assertion above is measuring propagation rather than reading a
    // value that happens to be lying around. If this ALSO saw "suspend", the test
    // above would be worthless.
    const seen: Record<string, unknown>[] = [];
    await drive(seen);

    expect(seen).toHaveLength(1);
    expect(seen[0]?.approvalPolicy).toBeUndefined();
  });
});

describe("tool ADVERTISEMENT under the AG-UI driver", () => {
  it("tells the model about the agent's own tools", async () => {
    // The scripted tool-call above proves EXECUTION works. It cannot prove
    // advertisement: a mock model emits the call whether or not any tool was
    // offered. If MastraAgent failed to pass the agent's tools through to
    // agent.stream(), a REAL model would never call one — which is exactly what a
    // live run showing zero tool calls would look like.
    const offered: string[][] = [];
    const agent = new Agent({
      name: "als-probe",
      instructions: "test",
      model: new MockLanguageModelV3({
        doStream: async (options: { tools?: Array<{ name?: string }> }) => {
          offered.push((options?.tools ?? []).map((t) => String(t?.name)));
          return {
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
      tools: { context_probe: makeContextProbeTool([]) },
    } as never);

    await runHeadlessViaMastraAgent({
      agent,
      agentId: "als-probe",
      content: "probe",
      describeCall: workspaceApprovalTitle,
      grantIdOf: workspaceToolGrantId,
      resourceId: "resource-1",
      runId: "run-ad",
      sinks: {},
      threadId: "thread-ad",
    });

    expect(offered).not.toHaveLength(0);
    expect(offered[0]).toContain("context_probe");
  });
});
