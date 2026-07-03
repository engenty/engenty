import type { ToolExecutionContext } from "@mastra/core/tools";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { EngentyCoreHttpError } from "../../../src/ai/core-http-client.js";
import { getCurrentEngentyToolsClient } from "./lib/client.js";
import { coreErrorToToolResult } from "./lib/errors.js";
import { isRecord, normalizeToolContract } from "./lib/format.js";
import { getEngentyToolsRunContext } from "./lib/run-context.js";
import {
  buildToolApprovalArtifact,
  resolveToolApprovalDecision,
  type ToolRiskLevel,
} from "./lib/tool-approval.js";
import { type RunEngentyToolInput, runInputSchema } from "./schema/schemas.js";

export const ENGENTY_TOOL_EXECUTE_TOOL_ID = "engenty_tool_execute";

/**
 * Suspend payload when a gated operation needs the user's approval (native
 * Mastra HITL): the run parks, the chat shows the Approve/Deny card, and the
 * resume re-executes this tool with {@link ToolApprovalResumeData} set.
 */
export const toolApprovalSuspendSchema = z.object({
  kind: z.literal("tool_approval"),
  operation_id: z.string(),
  requires_approval: z.boolean(),
  risk_level: z.enum(["low", "medium", "high", "critical"]),
  title: z.string().optional(),
});

export type ToolApprovalSuspendPayload = z.infer<
  typeof toolApprovalSuspendSchema
>;

/** What the resume delivers back into the suspended tool: the user's decision. */
export const toolApprovalResumeSchema = z.object({
  approved: z.boolean(),
  choice_id: z.string().optional(),
});

export type ToolApprovalResumeData = z.infer<typeof toolApprovalResumeSchema>;

export function isToolApprovalSuspendPayload(
  value: unknown
): value is ToolApprovalSuspendPayload {
  return toolApprovalSuspendSchema.safeParse(value).success;
}

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
  suspendSchema: toolApprovalSuspendSchema,
  resumeSchema: toolApprovalResumeSchema,
  execute: async (input, context) => executeEngentyTool(input, context),
});

export function createEngentyToolExecuteTool() {
  return engentyToolExecuteTool;
}

/** The model-facing result when a gated operation does not run. */
function approvalUnavailableResult(operationId: string) {
  return {
    ok: false as const,
    error: "approval_required",
    message: `Operation ${operationId} requires the user's approval, which is not available in this run. Report that this step needs approval instead of retrying.`,
  };
}

function approvalDeniedResult(operationId: string) {
  return {
    ok: false as const,
    error: "approval_denied",
    message: `The user denied approval for ${operationId}. Do not retry it; continue without this operation.`,
  };
}

/**
 * Handle an operation that requires approval, per the run's approval policy:
 * suspend the Mastra run (interactive chat — the resume re-executes this tool
 * with the decision), return the decision artifact (voice drives its own
 * approve flow), or return a clear denial (leaf runs: delegated children and
 * headless jobs have no interactive channel).
 */
async function gateRequiresApproval(input: {
  context: ToolExecutionContext | undefined;
  operationId: string;
  requiresApproval: boolean;
  riskLevel: ToolRiskLevel;
  title?: string;
}) {
  const policy = getEngentyToolsRunContext().approvalPolicy ?? "deny";
  const suspend = input.context?.agent?.suspend;
  if (policy === "suspend" && suspend) {
    await suspend({
      kind: "tool_approval",
      operation_id: input.operationId,
      requires_approval: input.requiresApproval,
      risk_level: input.riskLevel,
      ...(input.title ? { title: input.title } : {}),
    } satisfies ToolApprovalSuspendPayload);
    // Unreachable once resumed (execute re-runs with resumeData set), but Mastra
    // requires a value/void return on the suspend path.
    return undefined as never;
  }
  if (policy === "artifact") {
    return buildToolApprovalArtifact({
      operationId: input.operationId,
      requiresApproval: input.requiresApproval,
      riskLevel: input.riskLevel,
      ...(input.title ? { title: input.title } : {}),
    });
  }
  return approvalUnavailableResult(input.operationId);
}

export async function executeEngentyTool(
  input: RunEngentyToolInput,
  contextOrClient:
    | ToolExecutionContext
    | ReturnType<typeof getCurrentEngentyToolsClient>
    | undefined
) {
  const executionContext =
    contextOrClient && "ok" in contextOrClient ? undefined : contextOrClient;
  const client =
    contextOrClient && "ok" in contextOrClient
      ? contextOrClient
      : getCurrentEngentyToolsClient(contextOrClient);
  if (!client.ok) {
    return client;
  }
  // Resume after an approval suspend: the user decided; execute re-runs from
  // the top with the decision attached. A denial short-circuits here.
  const resume = toolApprovalResumeSchema.safeParse(
    executionContext?.agent?.resumeData
  );
  const resumedApproval = resume.success ? resume.data : null;
  let operationId = "";
  try {
    const parsed = runInputSchema.parse(input);
    operationId = parsed.id;
    const contract = await client.client.describeTool(parsed.id);
    const entry = normalizeToolContract(contract);
    operationId = entry.tool.toolId;
    if (resumedApproval && !resumedApproval.approved) {
      return approvalDeniedResult(operationId);
    }
    // The gate: contract-driven (requiresApproval), bypassed by chat grants or
    // a just-approved resume. Core stays authoritative via the 202 backstop.
    const decision = resolveToolApprovalDecision({
      grants: getEngentyToolsRunContext().approvalGrants,
      operationId: entry.tool.toolId,
      requiresApproval: entry.auth.requiresApproval,
      riskLevel: entry.auth.riskLevel,
    });
    if (decision === "require_approval" && !resumedApproval?.approved) {
      return gateRequiresApproval({
        context: executionContext,
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
    // `approval_required` (the pre-gate let it through, e.g. contract metadata
    // was stale), run the same approval handling as the pre-gate.
    if (
      err instanceof EngentyCoreHttpError &&
      err.code === "approval_required" &&
      operationId
    ) {
      if (resumedApproval?.approved) {
        // The user just approved, yet core still gates — a policy mismatch, not
        // something a re-prompt can fix. Surface it plainly.
        return approvalUnavailableResult(operationId);
      }
      return gateRequiresApproval({
        context: executionContext,
        operationId,
        requiresApproval: true,
        riskLevel: "high",
      });
    }
    return coreErrorToToolResult(err);
  }
}
