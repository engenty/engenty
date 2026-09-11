// The "artifact" approval policy: a gated call RETURNS the Approve/Deny card as a
// decision artifact (lib/tool-approval.ts `buildToolApprovalArtifact`) instead of
// calling Mastra's native suspend. Because nothing suspends, several gated calls
// in one step each produce their own card.
//
// USED BY the VOICE lane (realtime-tool-routes.ts), where the client re-calls the
// tool after approval. NOT by interactive chat, which runs
// `approvalPolicy: "suspend"` (conversation-run.ts) and gates with a native
// suspend instead.
//
// Why chat left: the artifact policy was adopted only to dodge a 1.52 upstream bug
// where two suspensions sharing a step wedged `resumeStream()`. That case cannot
// arise — a gated call parks the turn and a second gated call in the same step
// never executes (parallel-native-suspend.test.ts). Approvals are sequential
// because a person answers one card at a time. And an artifact card is a tool
// RESULT, which @ag-ui/mastra cannot map to a canonical AG-UI interrupt, so it
// blocked the cutover.
//
// This test still pins the artifact invariant for the lane that still uses it:
// two parallel gated calls each surface as a decision artifact via `tool_end`,
// with NO `tool_suspended`.
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
import {
  buildToolApprovalArtifact,
  isToolApprovalArtifactId,
} from "../../../../ai/tools/engenty-tools/lib/tool-approval.js";
import { isDecisionArtifactPayload } from "../../sessions/transcript.js";

const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };

/**
 * A gated tool that mirrors the "artifact" approval policy: instead of suspending,
 * it RETURNS the tool-approval decision artifact (what `engenty_tool_execute`
 * returns under `approvalPolicy: "artifact"` for an ungranted gated op).
 */
function makeArtifactGatedTool(id: string, log: string[]) {
  return createTool({
    id,
    description: `gate ${id}`,
    inputSchema: z.object({ q: z.string().optional() }),
    execute: async (input) => {
      const op = (input as { q?: string })?.q ?? "?";
      log.push(op);
      return buildToolApprovalArtifact({
        operationId: op,
        requiresApproval: true,
        riskLevel: "high",
      });
    },
  });
}

/** Session harness: mock model issues two gated calls in one step, text in step 2. */
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
    tools: { engenty_gate: makeArtifactGatedTool("engenty_gate", log) },
  } as never);

  const memory = new Memory({
    storage: new InMemoryStore(),
    options: { semanticRecall: false, workingMemory: { enabled: false } },
  });

  const basePath = path.join(tmpdir(), "parallel-tool-approval-artifact");
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

describe("parallel approval-gated tool calls (artifact policy — voice lane)", () => {
  it("surfaces BOTH parallel gated calls as decision artifacts with no Mastra suspend", {
    timeout: 60_000,
  }, async () => {
    const log: string[] = [];
    const { controller, session } = await buildHarness(log);

    const artifacts: Array<{ toolCallId: string; result: unknown }> = [];
    let sawSuspend = false;
    let runError: string | null = null;
    let finished = false;
    const unsub = session.subscribe((event) => {
      const e = event as {
        type?: string;
        toolCallId?: string;
        result?: unknown;
        error?: { message?: string };
      };
      if (e.type === "tool_suspended") {
        sawSuspend = true;
      }
      if (e.type === "error") {
        runError = e.error?.message ?? "run error";
      }
      if (e.type === "agent_end") {
        finished = true;
      }
      if (
        e.type === "tool_end" &&
        isDecisionArtifactPayload(e.result) &&
        isToolApprovalArtifactId(e.result.artifact_id)
      ) {
        artifacts.push({ result: e.result, toolCallId: e.toolCallId ?? "" });
      }
    });

    await session.sendMessage({ content: "go" });
    unsub();

    // The parallel-suspend bug can't fire: nothing suspended.
    expect(sawSuspend).toBe(false);
    expect(runError).toBeNull();
    expect(finished).toBe(true);
    // Both gated ops executed and BOTH returned an approval artifact — the two
    // parallel calls surface independently instead of wedging on a resume.
    expect(log.sort()).toEqual(["op_a", "op_b"]);
    expect(artifacts).toHaveLength(2);
    expect(artifacts.map((a) => a.toolCallId).sort()).toEqual([
      "call-a",
      "call-b",
    ]);
    for (const a of artifacts) {
      expect((a.result as { artifact_type?: string }).artifact_type).toBe(
        "decision"
      );
    }
    await controller.destroy().catch(() => undefined);
  });
});
