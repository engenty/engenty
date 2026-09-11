// `approval_gate` — human-in-the-loop as a NODE, not a fixed tail.
//
// This is the primitive the Phase-0 spike proved: a declarative `tool` entry
// receives the workflow's `suspend` on its execution context, and the suspend
// payload persists durably in the Mastra pg snapshot — so the inbox card can be
// rendered in a fresh process after a restart, and `run.resume({ step })` picks
// up exactly here.
//
// Rejection is NOT a hidden no-op: the gate returns `{ approved: false }` and
// the graph decides what that means (normally a `conditional` node routing to a
// no-op end). Making it explicit is the whole point — a reader of the canvas can
// see what happens when a human says no.
//
// Policy: request-semantics only. A gate never runs "defer" — deferring means
// unattended execution, which is exactly what a gate exists to prevent.
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { createWorkflowRunStoreFromEnv } from "../../index.js";
import { APPROVAL_GATE_PRIMITIVE_ID } from "../primitive-ids.js";
import { readGraphRunContext } from "../run-context.js";

export { APPROVAL_GATE_PRIMITIVE_ID } from "../primitive-ids.js";

/**
 * Gate kinds. The kind drives how the inbox card and the canvas render the
 * pending decision — the payload shape is per kind.
 */
export const approvalGateKindSchema = z.enum([
  /** "Do this?" — payload is a human-readable effect preview. */
  "confirm",
  /** Field-level patch review — payload.updates is the proposed patch. */
  "field_updates",
  /** Pick one of payload.options. */
  "choice",
]);

const inputSchema = z.object({
  kind: approvalGateKindSchema.default("confirm"),
  /** Short human sentence: "Send invoice #2041 to acme.com?" */
  title: z.string().min(1),
  /**
   * Rendered in the approval card. Keep it the ACTUAL data the human is
   * approving (amounts, recipients, field values) — not a restatement of
   * intent.
   */
  payload: z.record(z.string(), z.unknown()).default({}),
});

const outputSchema = z.object({
  approved: z.boolean(),
  /** Decision data: the edited patch, the chosen option, a rejection note. */
  data: z.record(z.string(), z.unknown()).optional(),
  reason: z.string().optional(),
});

const suspendSchema = z.object({
  kind: approvalGateKindSchema,
  title: z.string(),
  payload: z.record(z.string(), z.unknown()),
  context_id: z.string().optional(),
  context_type: z.string().optional(),
  request_id: z.string(),
});

const resumeSchema = z.object({
  approved: z.boolean(),
  data: z.record(z.string(), z.unknown()).optional(),
  reason: z.string().optional(),
});

export function createApprovalGatePrimitive() {
  return createTool({
    id: APPROVAL_GATE_PRIMITIVE_ID,
    description:
      "Pause the run for a human decision. Resumes with the approval outcome.",
    inputSchema,
    outputSchema,
    suspendSchema,
    resumeSchema,
    execute: async (input, ctx) => {
      const workflow = ctx.workflow;
      if (!workflow) {
        throw new Error(
          "graph-action: approval_gate ran outside a workflow — no suspend available"
        );
      }
      const runCtx = readGraphRunContext(ctx.requestContext);

      // Resume path first: the same tool re-executes with resumeData set once
      // the human decides (verified in the Phase-0 spike).
      const resumed = workflow.resumeData;
      if (resumed) {
        return {
          approved: resumed.approved === true,
          ...(resumed.data ? { data: resumed.data } : {}),
          ...(resumed.reason ? { reason: resumed.reason } : {}),
        };
      }

      // Mark the audit row awaiting input before suspending, so the inbox and
      // the run record agree even if the process dies immediately after.
      await createWorkflowRunStoreFromEnv()
        ?.setStatus({
          id: runCtx.requestId,
          status: "requires_action",
          tenantId: runCtx.tenantId,
        })
        .catch(() => {
          // best-effort — the agent_run status is the authority for the UI
        });

      await workflow.suspend({
        kind: input.kind,
        payload: input.payload,
        request_id: runCtx.requestId,
        title: input.title,
        ...(runCtx.contextType ? { context_type: runCtx.contextType } : {}),
        ...(runCtx.contextId ? { context_id: runCtx.contextId } : {}),
      });

      // Not reached in practice — the engine marks the run suspended and
      // discards this return. Present so the type checks and so a hypothetical
      // suspend-less engine fails closed (not approved) rather than open.
      return { approved: false, reason: "suspended" };
    },
  });
}
