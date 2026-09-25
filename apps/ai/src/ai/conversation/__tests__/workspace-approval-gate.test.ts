// A tool gated by `requireApproval`, run headless.
//
// THE DEFECT: Mastra has two chunks for one stop. A tool that calls `suspend()`
// itself emits `tool-call-suspended`, which `@ag-ui/mastra` maps to an AG-UI
// interrupt (agui-mastra-headless-interrupt.test.ts covers that half). A tool
// whose `requireApproval` gate says yes emits `tool-call-approval` — a type the
// bridge has no case for. It fell through to the default branch, so the run
// emitted TOOL_CALL_START/ARGS/END with no result, finished with a bare
// RUN_FINISHED (no interrupt outcome, no usage), and the gated call silently
// never ran: a routine fire ended with 0 text and a tool call frozen mid-flight.
//
// So both halves are executed here: the ask reaches `onApprovalRequired` for a
// run that can park, and a run that cannot ask answers itself and finishes the
// turn instead of dying on the pause.
import { Mastra } from "@mastra/core";
import { Agent } from "@mastra/core/agent";
import { InMemoryStore } from "@mastra/core/storage";
import { createTool } from "@mastra/core/tools";
import { Memory } from "@mastra/memory";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  workspaceApprovalSuspendPayload,
  workspaceApprovalTitle,
  workspaceToolGrantId,
} from "../../workspace/workspace-tool-guards.js";
import { runHeadlessViaMastraAgent } from "../delegate-run-agui-driver.js";

const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };

/** Stands in for `mastra_workspace_execute_command`: gated, never self-suspending. */
function gatedTool(log: string[]) {
  return createTool({
    id: "mastra_workspace_execute_command",
    description: "run a command in the sandbox",
    inputSchema: z.object({ command: z.string() }),
    requireApproval: true,
    execute: async (input: unknown) => {
      log.push(`ran:${(input as { command?: string }).command}`);
      return { exitCode: 0 };
    },
  } as never);
}

/** Calls the gated tool, then answers in words once it has the tool's verdict. */
function gatedAgent(log: string[]) {
  let call = 0;
  const storage = new InMemoryStore();
  return new Agent({
    // Storage on the Mastra instance is what makes the agentic-loop snapshot
    // durable, and a decline is a resume: without it there is nothing to
    // continue from.
    mastra: new Mastra({ storage } as never),
    name: "gated",
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
                    input: JSON.stringify({ command: "date" }),
                    toolCallId: "call-exec",
                    toolName: "mastra_workspace_execute_command",
                    type: "tool-call",
                  },
                  { finishReason: "tool-calls", type: "finish", usage },
                ],
              }),
            }
          : {
              stream: simulateReadableStream({
                chunks: [
                  { type: "stream-start", warnings: [] },
                  { id: "t1", type: "text-start" },
                  { delta: "brief", id: "t1", type: "text-delta" },
                  { id: "t1", type: "text-end" },
                  { finishReason: "stop", type: "finish", usage },
                ],
              }),
            };
      },
    } as never) as never,
    memory: new Memory({
      options: { semanticRecall: false, workingMemory: { enabled: false } },
      storage,
    }),
    storage,
    tools: { mastra_workspace_execute_command: gatedTool(log) },
  } as never);
}

function run(log: string[], extra: Record<string, unknown> = {}) {
  return runHeadlessViaMastraAgent({
    agent: gatedAgent(log),
    agentId: "gated",
    content: "write the brief",
    describeCall: workspaceApprovalTitle,
    grantIdOf: workspaceToolGrantId,
    resourceId: "resource-1",
    runId: "run-gate",
    sinks: {},
    threadId: "thread-gate",
    ...extra,
  });
}

describe("the card a chat turn shows for the same gate", () => {
  it("is keyed on the grant a later run spends", () => {
    // The identity that makes an approval worth giving: what a person approves
    // in chat is the id a headless fire — or the next fire of a routine holding
    // it — checks against. Two different ids would mean approving twice forever.
    const args = { path: "/shared/reports", recursive: true };
    const payload = workspaceApprovalSuspendPayload({
      args,
      toolName: "mastra_workspace_delete",
    });

    expect(payload.operation_id).toBe(
      workspaceToolGrantId("mastra_workspace_delete", args)
    );
    expect(payload).toMatchObject({
      kind: "tool_approval",
      requires_approval: true,
      risk_level: "high",
      body: "/shared/reports and everything inside it",
      title: "Delete",
    });
  });
});

describe("a requireApproval gate on the headless lane", () => {
  it("reports the ask for a run that can park", async () => {
    const log: string[] = [];
    const asked: { operationId: string; title: string }[] = [];
    const outcome = await run(log, {
      sinks: {
        onApprovalRequired: (input: { operationId: string; title: string }) =>
          asked.push({ operationId: input.operationId, title: input.title }),
      },
    });

    // The grant id is the one a standing approval is written under — the
    // exact command, so approving `date` does not approve every command.
    expect(asked).toEqual([
      {
        operationId: "workspace:mastra_workspace_execute_command:date",
        title: "Run command: date",
      },
    ]);
    expect([...outcome.workspaceSuspensions]).toEqual([
      "workspace:mastra_workspace_execute_command:date",
    ]);
    expect(log).toEqual([]);
  });

  it("declines its own pause and finishes the turn when nobody can be asked", async () => {
    const log: string[] = [];
    const outcome = await run(log, { declineApprovals: true });

    // The whole point: the turn produces its answer. Before the translation the
    // run ended here with an empty string and a tool call stuck at "call".
    expect(outcome.finalText).toBe("brief");
    // Declined, so the tool did NOT run — a decline is never fail-open.
    expect(log).toEqual([]);
    // And a declined call is not a park: nothing is left for a human to answer.
    expect([...outcome.workspaceSuspensions]).toEqual([]);
  });
});
