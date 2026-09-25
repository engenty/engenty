import type { PublicSchema } from "@mastra/core/schema";
import { createTool } from "@mastra/core/tools";
import { jsonSchema } from "ai";
import { EngentyCoreHttpError } from "../../../src/ai/core-http-client.js";
import { getCurrentEngentyToolsClient } from "./lib/client.js";
import { coerceRunInput } from "./lib/coerce-run-input.js";
import { coreErrorToToolResult, noToolResultError } from "./lib/errors.js";
import {
  approvalDeniedResult,
  approvalPendingResult,
  approvalUnavailableResult,
  gateRequiresApproval,
  parseToolRiskLevel,
  sandboxApprovalRequiredResult,
  sandboxRequiresGrant,
  settleCoreApprovalAndRetry,
  type ToolApprovalSuspendPayload,
  toolApprovalResumeSchema,
  toolApprovalSuspendSchema,
} from "./lib/execute-approval.js";
import { normalizeExecuteEvidence } from "./lib/execute-result.js";
import { isRecord, normalizeToolContract } from "./lib/format.js";
import {
  duplicateCallResult,
  invocationKey,
  splitRepeatFlag,
} from "./lib/invocation-dedupe.js";
import type { ToolRequestContextCarrier } from "./lib/run-context.js";
import { getEngentyToolsRunContext } from "./lib/run-context.js";
import {
  callSpaceIdFor,
  checkOperationAgainstSpace,
} from "./lib/space-gate.js";
import {
  resolveToolApprovalDecision,
  type ToolRiskLevel,
} from "./lib/tool-approval.js";
import {
  type RunEngentyToolInput,
  runExecuteModelInputJsonSchema,
} from "./schema/schemas.js";

export const ENGENTY_TOOL_EXECUTE_TOOL_ID = "engenty_tool_execute";

export {
  gateRequiresApproval,
  isToolApprovalSuspendPayload,
  type ToolApprovalResumeData,
  type ToolApprovalSuspendPayload,
  toolApprovalResumeSchema,
  toolApprovalSuspendSchema,
} from "./lib/execute-approval.js";

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
    'Execute a selected Engenty tool by id through core. Use only after discover/search has selected the tool id. Pass `input` as a JSON STRING of the operation arguments (not a nested object — providers strip nested objects to {}). Example: {"type":"organisation","display_name":"SFG"}. For read-only list tools that take no arguments, pass "{}". A catalog hit is not app data — only this tool\'s ok:true result is evidence for record facts.',
  inputSchema: jsonSchema(
    runExecuteModelInputJsonSchema as unknown as Parameters<
      typeof jsonSchema
    >[0]
  ) as unknown as PublicSchema<Record<string, unknown>>,
  suspendSchema: toolApprovalSuspendSchema,
  resumeSchema: toolApprovalResumeSchema,
  execute: async (input, context) =>
    executeEngentyTool(input as RunEngentyToolInput, context),
});

export function createEngentyToolExecuteTool() {
  return engentyToolExecuteTool;
}

/**
 * Building an App is a SEQUENCE (create → write → propose → publish), not four
 * independent calls, and the `app_build` workflow is where that sequence lives.
 * A model driving the steps by hand loses its own app_id across interruptions —
 * it minted three duplicate apps in the first chat E2E — and, because only the
 * workflow publishes the preview artifact, an App assembled this way is never
 * visible to the user at all. The copilot's AGENTS.md has forbidden this since
 * the workflow landed; a later live run showed it doing it anyway (asking for
 * `app_create`, then `app_file_write`, one approval at a time), so the rule is
 * enforced here rather than merely stated.
 *
 * Only the AUTHORING trio is closed. Reads stay open, and the human's own acts
 * (`app_release_approve` / `_reject`) stay reachable from chat — those are the
 * point of the approval flow, not a shortcut around it.
 */
const APP_AUTHORING_OPERATIONS = new Set([
  "app_create",
  "app_file_write",
  "app_release_propose",
]);

function appAuthoringRedirectResult(operationId: string) {
  return {
    ok: false as const,
    error: "use_app_build",
    message:
      `Operation ${operationId} cannot be called directly — building an App is one ` +
      "sequence, not separate steps. Use the app_build tool (name, manifest and the " +
      "COMPLETE file set in a single call), or delegate to engenty.app-coder via " +
      "agent-app_coder if you do not have app_build. app_build creates-or-reuses the " +
      "app, writes the draft, compiles it, and publishes the live preview the user " +
      "sees — driving the steps by hand skips that and produces an invisible app.",
  };
}

/** Required property names from an operation contract's input JSON schema. */
function requiredInputKeys(
  jsonSchema: Record<string, unknown> | undefined
): string[] {
  const required = jsonSchema?.required;
  return Array.isArray(required)
    ? required.filter((key): key is string => typeof key === "string")
    : [];
}

/**
 * The model-facing result when a tool call arrives with an EMPTY input object
 * for an operation that requires fields. Weaker models drop function-call
 * arguments entirely; without this guard the empty input reaches core and
 * surfaces as a raw validation error the model tends to retry verbatim.
 */
function emptyToolInputResult(operationId: string, required: string[]) {
  return {
    ok: false as const,
    error: "empty_tool_input",
    message: `The ${operationId} call was rejected before execution: its input arrived empty, but the operation requires: ${required.join(", ")}. Pass those fields as a JSON string in the input argument, not as a nested object (nested objects are stripped in transport). Example: {"type":"organisation","display_name":"SFG"}. Retry once with the full JSON string; if it arrives empty again, stop and report this failure.`,
  };
}

export async function executeEngentyTool(
  input: RunEngentyToolInput,
  contextOrClient:
    | ToolRequestContextCarrier<ToolApprovalSuspendPayload>
    | ReturnType<typeof getCurrentEngentyToolsClient>
    | undefined,
  options?: {
    /**
     * Code Mode: the call comes from a running sandbox program, which cannot
     * suspend for a human. Gated operations (requiresApproval, or high/critical
     * risk) run only when a pre-existing grant covers them; otherwise they fail
     * into the program with the pre-approval recovery path. Core stays
     * authoritative behind this gate (the 202 backstop maps to the same
     * result instead of suspending).
     */
    sandbox?: boolean;
  }
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
  let contractRisk: ToolRiskLevel = "medium";
  let contractRequiresApproval = true;
  // Grant context for the approval card (secrets_reveal only): captured out
  // here so the core-202 backstop in the catch block can carry it too.
  let gateSecretId: string | undefined;
  let resolvedInputForRetry: Record<string, unknown> = {};
  let callSpaceId: string | undefined;
  // Set for a non-read-only call when the run carries a dedupe map, so the
  // catch block's settle-and-retry success can register the invocation too.
  let dedupeKey: string | null = null;
  try {
    const parsed = coerceRunInput(input);
    operationId = parsed.id;
    const contract = await client.client.describeTool(parsed.id);
    const entry = normalizeToolContract(contract);
    operationId = entry.tool.toolId;
    contractRisk = entry.auth.riskLevel;
    contractRequiresApproval = entry.auth.requiresApproval;
    if (APP_AUTHORING_OPERATIONS.has(operationId)) {
      return appAuthoringRedirectResult(operationId);
    }
    // The space gate runs BEFORE the approval gate on purpose: never ask a
    // human to approve a call that this space was never going to allow.
    const spaceRefusal = checkOperationAgainstSpace({
      operationId,
      // The contract's own `readOnly` when it states one; the normalized
      // derivation (low risk, no approval) only as a fallback. Deriving it
      // would treat a medium-risk READ as a write and refuse it in a
      // read-only space, which is the wrong direction to be wrong in.
      readOnly: contract.readOnly ?? entry.execution.readOnly,
      space: getEngentyToolsRunContext().space,
      ...(entry.moduleId ? { moduleId: entry.moduleId } : {}),
    });
    if (spaceRefusal) {
      return spaceRefusal;
    }
    if (
      options?.sandbox &&
      sandboxRequiresGrant(entry.auth) &&
      !getEngentyToolsRunContext().approvalGrants?.includes(entry.tool.toolId)
    ) {
      return sandboxApprovalRequiredResult(
        entry.tool.toolId,
        entry.auth.riskLevel
      );
    }
    if (resumedApproval && !resumedApproval.approved) {
      return approvalDeniedResult(operationId);
    }
    // Empty-input guard BEFORE the approval gate: never ask the user to approve
    // a call that cannot succeed. (An input with wrong/partial fields still goes
    // to core for a precise validation error.)
    // `_repeat` (invocation-dedupe) is model-facing only: split off here so it
    // never reaches the approval gate, the recorded replay call, or core.
    const { input: rawInput, repeat } = splitRepeatFlag(parsed.input);
    if (
      entry.tool.toolId === "secrets_reveal" &&
      typeof rawInput.secret_id === "string"
    ) {
      gateSecretId = rawInput.secret_id;
    }
    const required = requiredInputKeys(entry.input.jsonSchema);
    if (required.length > 0 && Object.keys(rawInput).length === 0) {
      return emptyToolInputResult(entry.tool.toolId, required);
    }
    // The gate: contract-driven (requiresApproval), bypassed by chat grants or
    // a just-approved resume. Core stays authoritative via the 202 backstop.
    const decision = resolveToolApprovalDecision({
      grants: getEngentyToolsRunContext().approvalGrants,
      operationId: entry.tool.toolId,
      requiresApproval: entry.auth.requiresApproval,
      riskLevel: entry.auth.riskLevel,
    });
    // "defer": headless task runs skip the local gate — core is authoritative
    // and may allow (durable connection grant), 202 (recording a durable
    // approval request), or 403. The 202 backstop below shapes the result.
    const approvalPolicy = getEngentyToolsRunContext().approvalPolicy ?? "deny";
    if (
      decision === "require_approval" &&
      !resumedApproval?.approved &&
      approvalPolicy !== "defer"
    ) {
      return gateRequiresApproval({
        callInput: rawInput,
        context: executionContext,
        operationId: entry.tool.toolId,
        requiresApproval: entry.auth.requiresApproval,
        riskLevel: entry.auth.riskLevel,
        ...(gateSecretId ? { secretId: gateSecretId } : {}),
        title: entry.title,
      });
    }
    const resolvedInput = injectRunContextFields(rawInput);
    // Kept for the catch block's retry-after-settling-core path.
    resolvedInputForRetry = resolvedInput;
    // Exactly-once for identical writes (invocation-dedupe.ts): a repeat of a
    // call that already SUCCEEDED in this run is refused with the first result
    // attached, instead of writing a second record. Approval grants make
    // repeats free to execute silently, which is how an approved
    // kb_source_create ran twice on 2026-08-22 — the gate above cannot catch
    // that, only this can. `_repeat: true` is the deliberate-repeat escape.
    const executedWriteCalls = getEngentyToolsRunContext().executedWriteCalls;
    const operationReadOnly = contract.readOnly ?? entry.execution.readOnly;
    if (!operationReadOnly && executedWriteCalls) {
      dedupeKey = invocationKey(entry.tool.toolId, resolvedInput);
      if (!repeat && executedWriteCalls.has(dedupeKey)) {
        return duplicateCallResult(
          entry.tool.toolId,
          executedWriteCalls.get(dedupeKey)
        );
      }
    }
    callSpaceId = callSpaceIdFor(
      {
        operationId: entry.tool.toolId,
        ...(entry.moduleId ? { moduleId: entry.moduleId } : {}),
      },
      getEngentyToolsRunContext().space
    );
    const data = await client.client.invokeTool(
      entry.tool.toolId,
      resolvedInput,
      callSpaceId ? { spaceId: callSpaceId } : undefined
    );
    const evidence = normalizeExecuteEvidence(entry.tool.toolId, data);
    if (dedupeKey && evidence.ok) {
      executedWriteCalls?.set(dedupeKey, evidence);
    }
    return evidence;
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
        // The user approved THIS operation moments ago (the AI pre-gate's card),
        // and core is now gating the same operation for its own reason — the
        // escalation policy, a connections policy. Two gates, one intent: asking
        // again is asking the same question twice, which is exactly what the
        // user saw in prod. Spend the consent that was already given on core's
        // request and retry once. Not a bypass — same principal, same operation,
        // same turn, and core still records who decided and mints the grant.
        const retried = await settleCoreApprovalAndRetry({
          client,
          err,
          input: resolvedInputForRetry,
          operationId,
          ...(callSpaceId ? { spaceId: callSpaceId } : {}),
          ...(resumedApproval.choice_id
            ? { choiceId: resumedApproval.choice_id }
            : {}),
        });
        if (retried) {
          const evidence = normalizeExecuteEvidence(operationId, retried.data);
          if (dedupeKey && evidence.ok) {
            getEngentyToolsRunContext().executedWriteCalls?.set(
              dedupeKey,
              evidence
            );
          }
          return evidence;
        }
        // No request id to decide, or core gated again after the grant landed —
        // a real policy mismatch a re-prompt cannot fix. Say so plainly.
        return approvalUnavailableResult(operationId);
      }
      const personApproval = getEngentyToolsRunContext().personApproval;
      if (personApproval?.operationIds.includes(operationId)) {
        // A person allowed this call on the wizard's approval step; core asks
        // the run's principal again. Decide core's request as that person and
        // retry once — same call, same run, recorded under who approved it.
        const retried = await settleCoreApprovalAndRetry({
          client,
          decide: personApproval.decide,
          err,
          input: resolvedInputForRetry,
          operationId,
          ...(callSpaceId ? { spaceId: callSpaceId } : {}),
        });
        if (retried) {
          const evidence = normalizeExecuteEvidence(operationId, retried.data);
          if (dedupeKey && evidence.ok) {
            getEngentyToolsRunContext().executedWriteCalls?.set(
              dedupeKey,
              evidence
            );
          }
          return evidence;
        }
        return approvalUnavailableResult(operationId);
      }
      if ((getEngentyToolsRunContext().approvalPolicy ?? "deny") === "defer") {
        const ctx = getEngentyToolsRunContext();
        const details = isRecord(err.details) ? err.details : {};
        if (ctx.onApprovalRequired) {
          // Task lane under `auto`/`pass-all`: the pre-gate stood aside, core
          // decided, and core said a human is needed. Translate its 202 into
          // the SAME park the "request" path produces — record the op (with
          // the exact call input, so the approval can replay it once) via the
          // run's collector; the workflow then pauses `needs_approval` and a
          // grant + re-dispatch clears it. The task workflow files its own
          // needs-input notification, so the connections inbox ping below is
          // for runs with no collector only.
          ctx.onApprovalRequired({
            input: resolvedInputForRetry,
            operationId,
            riskLevel: parseToolRiskLevel(details.riskLevel) ?? contractRisk,
          });
          return approvalPendingResult(operationId, err.message);
        }
        // Headless defer run with no task collector: core recorded the
        // durable approval request and announced it (`approval.requested` →
        // one decidable `approval_requested` record with actor and space);
        // nothing to add here.
        return approvalPendingResult(operationId, err.message);
      }
      if (options?.sandbox) {
        // Program dispatch cannot suspend; fail into the program with the
        // recovery path (core stayed authoritative — its 202 lands here even
        // when the local sandbox gate let the call through, e.g. stale
        // contract metadata or a policy only core can evaluate).
        const details = isRecord(err.details) ? err.details : {};
        return sandboxApprovalRequiredResult(
          operationId,
          parseToolRiskLevel(details.riskLevel) ?? contractRisk
        );
      }
      // Carry core's own request id onto the card. The approve hook decides it
      // in core, which mints the grant `evaluatePolicy` spends on the retry —
      // the thread-metadata grant it also writes is read by the pre-gate only.
      const details = isRecord(err.details) ? err.details : {};
      const approvalRequestId =
        typeof details.approvalRequestId === "string"
          ? details.approvalRequestId
          : undefined;
      return gateRequiresApproval({
        callInput: resolvedInputForRetry,
        context: executionContext,
        operationId,
        requiresApproval:
          typeof details.requiresApproval === "boolean"
            ? details.requiresApproval
            : contractRequiresApproval,
        riskLevel: parseToolRiskLevel(details.riskLevel) ?? contractRisk,
        ...(gateSecretId ? { secretId: gateSecretId } : {}),
        ...(approvalRequestId ? { approvalRequestId } : {}),
      });
    }
    if (
      err instanceof EngentyCoreHttpError &&
      (err.code === "invalid_core_response" ||
        err.code === "invalid_core_json") &&
      operationId
    ) {
      return noToolResultError(operationId);
    }
    // The catalog holds MODULE operations only. A model routing one of its own
    // chat tools (routines_list, agent_propose, invoke_workflow, …) through here
    // gets a bare 404 — and a bare "Tool contract not found" reads as "the
    // feature is missing", so the model gives up instead of correcting course.
    if (
      err instanceof EngentyCoreHttpError &&
      err.status === 404 &&
      operationId
    ) {
      const result = coreErrorToToolResult(err);
      return {
        ...result,
        message:
          `${result.message}. "${operationId}" is not a module operation in ` +
          "the catalog. If a tool with this name is already on your own tool " +
          "list, call it directly — chat tools never go through " +
          "engenty_tool_execute.",
      };
    }
    return coreErrorToToolResult(err);
  }
}
