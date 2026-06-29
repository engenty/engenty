import type { ToolExecutionContext } from "@mastra/core/tools";
import { createTool } from "@mastra/core/tools";
import { EngentyCoreHttpError } from "../../../src/ai/core-http-client.js";
import { getCurrentEngentyToolsClient } from "./lib/client.js";
import { coreErrorToToolResult } from "./lib/errors.js";
import { isRecord, normalizeToolContract } from "./lib/format.js";
import { getEngentyToolsRunContext } from "./lib/run-context.js";
import {
  buildToolApprovalArtifact,
  resolveToolApprovalDecision,
} from "./lib/tool-approval.js";
import { type RunEngentyToolInput, runInputSchema } from "./schema/schemas.js";

export const ENGENTY_TOOL_EXECUTE_TOOL_ID = "engenty_tool_execute";

/**
 * Inject harness-controlled fields into tool inputs so the LLM cannot
 * hallucinate them. Currently handles `agent_run_id`: always overrides
 * with the ALS run context value when available, preventing FK violations from
 * LLM-invented UUIDs.
 */
function injectRunContextFields(
  input: Record<string, unknown>
): Record<string, unknown> {
  const ctx = getEngentyToolsRunContext();
  if (!ctx.runId) {
    return input;
  }
  if ("agent_run_id" in input) {
    return { ...input, agent_run_id: ctx.runId };
  }
  return input;
}

export const engentyToolExecuteTool = createTool({
  id: ENGENTY_TOOL_EXECUTE_TOOL_ID,
  description:
    "Execute a selected Engenty tool by id through core. Use only after discover has selected the tool id. For read-only list tools, an empty input object is often valid.",
  inputSchema: runInputSchema,
  execute: async (input, context) => executeEngentyTool(input, context),
});

export function createEngentyToolExecuteTool() {
  return engentyToolExecuteTool;
}

export async function executeEngentyTool(
  input: RunEngentyToolInput,
  contextOrClient:
    | ToolExecutionContext
    | ReturnType<typeof getCurrentEngentyToolsClient>
    | undefined
) {
  const client =
    contextOrClient && "ok" in contextOrClient
      ? contextOrClient
      : getCurrentEngentyToolsClient(contextOrClient);
  if (!client.ok) {
    return client;
  }
  let operationId = "";
  try {
    const parsed = runInputSchema.parse(input);
    operationId = parsed.id;
    const contract = await client.client.describeTool(parsed.id);
    const entry = normalizeToolContract(contract);
    operationId = entry.tool.toolId;
    // Phase 3.2c — PRE-GATE: if the contract demands approval (or is high/critical
    // risk) and the user hasn't already approved this operation in the chat, return
    // a decision artifact instead of invoking. The run loop detects it (it satisfies
    // `isDecisionArtifactPayload`), aborts, and surfaces an Approve/Deny card. On
    // approve we persist a thread grant and re-run — this time the gate passes.
    const decision = resolveToolApprovalDecision({
      grants: getEngentyToolsRunContext().approvalGrants,
      operationId: entry.tool.toolId,
      requiresApproval: entry.auth.requiresApproval,
      riskLevel: entry.auth.riskLevel,
    });
    if (decision === "require_approval") {
      return buildToolApprovalArtifact({
        operationId: entry.tool.toolId,
        requiresApproval: entry.auth.requiresApproval,
        riskLevel: entry.auth.riskLevel,
        title: entry.title,
      });
    }
    const rawInput = isRecord(parsed.input) ? parsed.input : {};
    const resolvedInput = injectRunContextFields(rawInput);
    const data = await client.client.invokeTool(
      entry.tool.toolId,
      resolvedInput
    );
    return {
      ok: true,
      data,
    };
  } catch (err) {
    // BACKSTOP: core is authoritative. If the invoke itself returns 202
    // `approval_required` (the pre-gate let it through, e.g. contract metadata was
    // stale), surface the same Approve/Deny card rather than a dead error.
    if (
      err instanceof EngentyCoreHttpError &&
      err.code === "approval_required" &&
      operationId
    ) {
      return buildToolApprovalArtifact({
        operationId,
        requiresApproval: true,
        riskLevel: "high",
      });
    }
    return coreErrorToToolResult(err);
  }
}
