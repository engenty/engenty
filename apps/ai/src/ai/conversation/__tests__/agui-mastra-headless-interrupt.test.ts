// Interrupts on the headless lane, as `@ag-ui/mastra` reports them.
//
// THE QUESTION: if `delegate-run` is driven by `@ag-ui/mastra`'s MastraAgent instead
// of a Mastra Session, can a HEADLESS run still turn a workspace tool's suspension
// into `onApprovalRequired`?
//
// WHY IT MATTERS: `delegate-run.ts:537` intercepts `tool_suspended` for workspace
// tools and forwards it to `onApprovalRequired`, which the task job aggregates into
// `pendingByOp`, pauses at `needs_approval`, and resumes on re-dispatch with grants.
// Without that, "the run would hang on a suspension nothing headless resumes."
// MastraAgent maps a suspension to an AG-UI interrupt expecting a CLIENT to answer,
// and nothing headless answers — so the bridge has to be rebuilt from whatever the
// interrupt carries.
//
// The grant id the task job keys on is `workspaceToolGrantId(toolName, args)` =
// `workspace:${toolName}:${path}` — argument-dependent, so `toolName` alone is not
// enough. Both `toolName` AND `args` must survive the mapping.
//
// A source read of `suspendToInterrupt` said they do, under `metadata.mastra`. This
// executes it, because a source read is not a run.
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { MastraAgent } from "@ag-ui/mastra";
import { Agent } from "@mastra/core/agent";
import { InMemoryStore } from "@mastra/core/storage";
import { createTool } from "@mastra/core/tools";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { workspaceToolGrantId } from "../../workspace/workspace-tool-guards.js";

const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };

/** Stands in for a gated workspace tool: suspends with the call's args in play. */
function makeSuspendingWorkspaceTool(log: string[]) {
  return createTool({
    id: "mastra_workspace_delete",
    description: "delete a workspace path",
    inputSchema: z.object({
      path: z.string(),
      recursive: z.boolean().optional(),
    }),
    resumeSchema: z.object({ approved: z.boolean() }),
    execute: async (input, context) => {
      const args = input as { path?: string };
      const ctx = context as {
        agent?: {
          resumeData?: { approved?: boolean };
          suspend?: (payload: unknown) => Promise<unknown>;
        };
      };
      if (ctx?.agent?.resumeData?.approved !== undefined) {
        log.push(`resumed:${args.path}`);
        return { deleted: true };
      }
      log.push(`suspend:${args.path}`);
      await ctx?.agent?.suspend?.({ kind: "workspace_tool", path: args.path });
      return undefined as never;
    },
  });
}

function buildAgent(log: string[]) {
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
              toolCallId: "call-del",
              toolName: "mastra_workspace_delete",
              input: JSON.stringify({
                path: "/shared/reports",
                recursive: true,
              }),
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
  mkdirSync(path.join(tmpdir(), "agui-mastra-headless"), { recursive: true });
  return new Agent({
    name: "headless-workspace-gate",
    instructions: "test",
    memory: undefined,
    model: new MockLanguageModelV3({ doStream: doStream as never }) as never,
    tools: { mastra_workspace_delete: makeSuspendingWorkspaceTool(log) },
    storage: new InMemoryStore(),
  } as never);
}

describe("4a: a headless MastraAgent run surfaces a workspace suspension", () => {
  it("carries toolName and args through to the interrupt, so the grant id survives", {
    timeout: 60_000,
  }, async () => {
    const log: string[] = [];
    const agent = new MastraAgent({
      agent: buildAgent(log) as never,
      agentId: "headless-workspace-gate",
      threadId: "thread-1",
    } as never);
    agent.messages = [
      { id: "m1", role: "user", content: "delete /shared/reports" },
    ] as never;

    const events: Record<string, unknown>[] = [];
    await agent.runAgent(
      { runId: "run-1" } as never,
      {
        onEvent: ({ event }: { event: Record<string, unknown> }) => {
          events.push(event);
        },
      } as never
    );

    expect(log).toContain("suspend:/shared/reports");

    const finished = events.find((e) => e.type === "RUN_FINISHED") as
      | { outcome?: { type?: string; interrupts?: Record<string, never>[] } }
      | undefined;
    const outcome = finished?.outcome;

    expect(outcome?.type).toBe("interrupt");
    const interrupt = outcome?.interrupts?.[0] as
      | {
          metadata?: {
            mastra?: { args?: Record<string, unknown>; toolName?: string };
          };
          toolCallId?: string;
        }
      | undefined;
    expect(interrupt).toBeDefined();

    // THE ASSERTION THAT DECIDES 4a. Everything else above is scaffolding: the
    // headless bridge can only rebuild its grant id if BOTH of these survive.
    const mastra = interrupt?.metadata?.mastra;
    expect(mastra?.toolName).toBe("mastra_workspace_delete");
    expect(mastra?.args).toMatchObject({
      path: "/shared/reports",
      recursive: true,
    });

    // And the id the task job actually keys on must come out identical to what
    // the Session path produces today.
    expect(
      workspaceToolGrantId(
        mastra?.toolName ?? "",
        (mastra?.args ?? {}) as Record<string, unknown>
      )
    ).toBe("workspace:mastra_workspace_delete:/shared/reports");
  });
});
