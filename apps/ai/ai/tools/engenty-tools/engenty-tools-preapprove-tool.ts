// Bulk pre-approval for sandbox programs (Phase 3 of Code Mode writes).
//
// A Code Mode program cannot suspend for a human mid-flight, so gated writes
// need their grants BEFORE the program runs. This tool is that upfront step:
// the agent declares every write operation a planned program will call plus a
// human-readable reason, ONE approval card covers the whole set, and approving
// persists a grant per operation — "Approve for this run" as once-grants
// (cleared on the next fresh user turn), "Approve for this chat" as thread
// grants. The suspended run resumes with the decision and the agent proceeds
// straight to execute_typescript.
//
// Chat-only by design: the tool suspends natively (same tool_approval pipeline
// as the execute gate), so leaf runs without a human channel get a clear
// unavailable result instead. It is NOT exposed inside the sandbox.
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  gateRequiresApproval,
  type ToolApprovalSuspendPayload,
  toolApprovalResumeSchema,
  toolApprovalSuspendSchema,
} from "./engenty-tool-execute-tool.js";
import { getCurrentEngentyToolsClient } from "./lib/client.js";
import { coreErrorToToolResult } from "./lib/errors.js";
import { normalizeToolContract } from "./lib/format.js";
import type { ToolRequestContextCarrier } from "./lib/run-context.js";
import { getEngentyToolsRunContext } from "./lib/run-context.js";
import {
  TOOL_APPROVAL_CHOICE_APPROVE_ALWAYS,
  TOOL_APPROVAL_MAX_BULK_OPERATIONS,
  type ToolRiskLevel,
} from "./lib/tool-approval.js";

export const ENGENTY_TOOLS_PREAPPROVE_TOOL_ID = "engenty_tools_preapprove";

const preapproveInputSchema = z.object({
  operation_ids: z
    .array(z.string().trim().min(1))
    .min(1)
    .max(TOOL_APPROVAL_MAX_BULK_OPERATIONS)
    .describe(
      "Every gated operation the planned program will call (from engenty_tools_search ids)."
    ),
  reason: z
    .string()
    .trim()
    .min(1)
    .max(1000)
    .describe(
      "What the program will do with these operations, in the user's language — shown on the approval card."
    ),
  estimated_calls: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Rough total number of write calls the program will make."),
});

const RISK_ORDER: Record<ToolRiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

function needsGrant(input: {
  requiresApproval: boolean;
  riskLevel: ToolRiskLevel;
}): boolean {
  return (
    input.requiresApproval ||
    input.riskLevel === "high" ||
    input.riskLevel === "critical"
  );
}

export const engentyToolsPreapproveTool = createTool({
  id: ENGENTY_TOOLS_PREAPPROVE_TOOL_ID,
  description:
    "Request the user's approval for a SET of write operations before running a bulk execute_typescript program. " +
    "One approval card covers all listed operations; approving grants them for this run or this chat. " +
    "Call this BEFORE a program that writes (creates/updates/deletes) — sandbox calls to gated operations fail without a grant. " +
    "Not needed for read-only programs.",
  inputSchema: preapproveInputSchema,
  suspendSchema: toolApprovalSuspendSchema,
  resumeSchema: toolApprovalResumeSchema,
  execute: async (input, context) => {
    const executionContext = context as
      | ToolRequestContextCarrier<ToolApprovalSuspendPayload>
      | undefined;
    const client = getCurrentEngentyToolsClient(executionContext);
    if (!client.ok) {
      return client;
    }
    const parsed = preapproveInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false as const,
        error: "invalid_input",
        message: `Invalid pre-approval request: ${parsed.error.issues
          .map((issue) => issue.message)
          .join("; ")}`,
      };
    }
    const requestedIds = Array.from(new Set(parsed.data.operation_ids));
    // Resume after the approval card: the user decided. The grants themselves
    // were persisted by the resume route (once/always per the chosen scope);
    // this result just tells the model where it stands.
    const resume = toolApprovalResumeSchema.safeParse(
      executionContext?.agent?.resumeData
    );
    if (resume.success) {
      if (!resume.data.approved) {
        return {
          ok: false as const,
          error: "approval_denied",
          message:
            "The user denied write access for these operations. Do not run the program or retry the request; continue without the writes.",
        };
      }
      const scope =
        resume.data.choice_id === TOOL_APPROVAL_CHOICE_APPROVE_ALWAYS
          ? "chat"
          : "run";
      return {
        ok: true as const,
        granted_operation_ids: requestedIds,
        scope,
        message:
          scope === "chat"
            ? "Approved for this chat. Run the program now; the grants persist for follow-up programs in this conversation."
            : "Approved for this run. Run the program NOW — the grants clear on the next user turn.",
      };
    }
    try {
      // Resolve every id against the catalog — unknown ids fail the WHOLE
      // request (never show the user a card that names operations which do not
      // exist, and never let a hallucinated id ride along a real approval).
      const contracts = await Promise.all(
        requestedIds.map(async (id) => {
          try {
            const entry = normalizeToolContract(
              await client.client.describeTool(id)
            );
            return { id, entry };
          } catch {
            return { id, entry: null };
          }
        })
      );
      const unknown = contracts
        .filter((c) => c.entry === null)
        .map((c) => c.id);
      if (unknown.length > 0) {
        return {
          ok: false as const,
          error: "unknown_operations",
          unknown_operation_ids: unknown,
          message: `These operation ids do not exist in the catalog: ${unknown.join(", ")}. Use engenty_tools_search to find the real ids, then request pre-approval again.`,
        };
      }
      const resolved = contracts.map((c) => ({
        id: c.entry!.tool.toolId,
        auth: c.entry!.auth,
        title: c.entry!.title,
      }));
      const gated = resolved.filter((op) => needsGrant(op.auth));
      if (gated.length === 0) {
        return {
          ok: true as const,
          granted_operation_ids: [],
          message:
            "None of these operations require approval — run the program directly.",
        };
      }
      const grants = getEngentyToolsRunContext().approvalGrants ?? [];
      const missing = gated.filter((op) => !grants.includes(op.id));
      if (missing.length === 0) {
        return {
          ok: true as const,
          granted_operation_ids: gated.map((op) => op.id),
          message:
            "All of these operations are already approved in this chat — run the program directly.",
        };
      }
      // Same policy cascade as the execute gate: suspend (the parked resume
      // re-executes this tool with the decision), artifact (the interactive
      // start lane — approving persists every grant and RE-RUNS the turn, so
      // the re-run lands in the "already approved" branch above), request
      // (headless needs-input), or a clear denial for leaf runs.
      const maxRisk = missing.reduce<ToolRiskLevel>(
        (acc, op) =>
          RISK_ORDER[op.auth.riskLevel] > RISK_ORDER[acc]
            ? op.auth.riskLevel
            : acc,
        "low"
      );
      const calls = parsed.data.estimated_calls;
      return await gateRequiresApproval({
        body: `${parsed.data.reason}${calls ? ` (~${calls} write calls)` : ""}`,
        context: executionContext,
        operationId: missing[0]!.id,
        operationIds: missing.map((op) => op.id),
        requiresApproval: true,
        riskLevel: maxRisk,
        title: "bulk write access",
      });
    } catch (err) {
      return coreErrorToToolResult(err);
    }
  },
});

export function createEngentyToolsPreapproveTool() {
  return engentyToolsPreapproveTool;
}
