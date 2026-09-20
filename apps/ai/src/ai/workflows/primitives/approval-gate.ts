// `approval_gate` — human-in-the-loop as a NODE, not a fixed tail.
//
// A declarative `tool` entry receives the workflow's `suspend` on its
// execution context, and the suspend payload persists durably in the Mastra pg
// snapshot — so the card can be rendered in a fresh process after a restart,
// and `run.resume({ step })` picks up exactly here.
//
// What the gate puts on screen is ONE thing: an A2UI surface. The `surface`
// kind carries its own components and data model; `confirm`, `field_updates`
// and `choice` are authoring shorthands expanded into a surface by
// `gateSurfaceFor` at suspend time. A wizard page and a desk card therefore
// render the same envelope, and the person's answer comes back as the data
// model plus the event they pressed.
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
import { gateSurfaceFor } from "../gate-surface.js";
import { APPROVAL_GATE_PRIMITIVE_ID } from "../primitive-ids.js";
import { readGraphRunContext } from "../run-context.js";

export { APPROVAL_GATE_PRIMITIVE_ID } from "../primitive-ids.js";

/**
 * Gate kinds. `surface` is the general form; the other three are shorthands
 * whose payload shape is per kind.
 */
export const approvalGateKindSchema = z.enum([
  /** "Do this?" — payload is a human-readable effect preview. */
  "confirm",
  /** Field-level patch review — payload.updates is the proposed patch. */
  "field_updates",
  /** Pick one of payload.options. */
  "choice",
  /** payload = { components, data } — an A2UI surface with inputs and outputs. */
  "surface",
]);

const surfaceSchema = z.object({
  components: z.array(z.record(z.string(), z.unknown())),
  data: z.record(z.string(), z.unknown()),
});

const inputSchema = z.object({
  kind: approvalGateKindSchema.default("confirm"),
  /** Short human sentence: "Send invoice #2041 to acme.com?" */
  title: z.string().min(1),
  /**
   * Rendered in the card. Keep it the ACTUAL data the human is deciding on
   * (amounts, recipients, field values) — not a restatement of intent. For
   * kind "surface": { components, data }.
   */
  payload: z.record(z.string(), z.unknown()).default({}),
  /**
   * The page's data model when it comes from an earlier step — a mapping
   * source on this key (`{"step": "carry", "path": ""}`) is resolved by the
   * engine, which only resolves TOP-LEVEL keys; a source nested inside
   * `payload.data` would be stored literally. Merged over `payload.data`.
   */
  data: z.record(z.string(), z.unknown()).optional(),
  /**
   * Whether free text typed beside this step reaches the run. When true the
   * gate resumes with event "utterance" and data.utterance; the graph decides
   * what that means. Default false: the composer is closed while the step
   * waits.
   */
  accepts_text: z.boolean().default(false),
});

const outputSchema = z.object({
  approved: z.boolean(),
  /** Decision data: the surface's data model, the edited patch, the choice. */
  data: z.record(z.string(), z.unknown()).optional(),
  /** The action the person pressed ("next", "ok", "revise", "utterance", …). */
  event: z.string().optional(),
  reason: z.string().optional(),
});

const suspendSchema = z.object({
  kind: approvalGateKindSchema,
  title: z.string(),
  surface: surfaceSchema,
  accepts_text: z.boolean(),
  context_id: z.string().optional(),
  context_type: z.string().optional(),
  request_id: z.string(),
});

const resumeSchema = z.object({
  approved: z.boolean(),
  data: z.record(z.string(), z.unknown()).optional(),
  event: z.string().optional(),
  reason: z.string().optional(),
});

export type ApprovalGateSuspendEnvelope = z.infer<typeof suspendSchema>;
export type ApprovalGateResume = z.infer<typeof resumeSchema>;

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
      // the human decides.
      const resumed = workflow.resumeData as ApprovalGateResume | undefined;
      if (resumed) {
        return {
          approved: resumed.approved === true,
          ...(resumed.data ? { data: resumed.data } : {}),
          ...(resumed.event ? { event: resumed.event } : {}),
          ...(resumed.reason ? { reason: resumed.reason } : {}),
        };
      }

      // Built before the status write: a surface that fails the catalog
      // checks fails the step, never parks a run nobody can answer.
      const surface = gateSurfaceFor(input.kind, input.payload, input.data);

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
        accepts_text: input.accepts_text,
        kind: input.kind,
        request_id: runCtx.requestId,
        surface,
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
