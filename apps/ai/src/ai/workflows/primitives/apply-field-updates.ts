// `apply_field_updates` — write an approved patch onto the run's subject.
//
// This is the fixed tail of today's action harness (`applyApprovedUpdatesStep`)
// generalized into a node: it can appear anywhere, any number of times, and it
// is normally wired directly downstream of an `approval_gate` whose
// `kind: "field_updates"` produced the patch.
//
// The write itself reuses `applyApprovedFieldUpdates` unchanged — the generic
// `<module>_update` derivation from context_type, no per-module hardcoding.
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { applyApprovedFieldUpdates } from "../../jobs/apply-field-updates.js";
import { APPLY_FIELD_UPDATES_PRIMITIVE_ID } from "../primitive-ids.js";
import { readGraphRunContext, resolveGraphRunScope } from "../run-context.js";

export { APPLY_FIELD_UPDATES_PRIMITIVE_ID } from "../primitive-ids.js";

const inputSchema = z.object({
  /** Field patch to apply. Empty patch is a legitimate no-op (rejection path). */
  patch: z.record(z.string(), z.unknown()).default({}),
  /**
   * Subject override. Omit to write the run's own subject (the common case) —
   * a graph may only target another subject it was given explicitly upstream.
   */
  context_id: z.string().optional(),
  context_type: z.string().optional(),
});

const outputSchema = z.object({
  applied: z.number(),
  context_id: z.string().optional(),
  context_type: z.string().optional(),
});

export function createApplyFieldUpdatesPrimitive() {
  return createTool({
    id: APPLY_FIELD_UPDATES_PRIMITIVE_ID,
    description:
      "Apply an approved field patch to the run's subject via its module update operation.",
    inputSchema,
    outputSchema,
    execute: async (input, ctx) => {
      const runCtx = readGraphRunContext(ctx.requestContext);
      const contextType = input.context_type ?? runCtx.contextType;
      const contextId = input.context_id ?? runCtx.contextId;
      if (!(contextType && contextId)) {
        // No subject to write to — a no-op, not an error: the same graph can
        // run with and without a subject (manual trigger vs WorkflowButton).
        return { applied: 0 };
      }
      if (Object.keys(input.patch).length === 0) {
        return { applied: 0, context_id: contextId, context_type: contextType };
      }
      const scope = await resolveGraphRunScope(runCtx);
      const { applied } = await applyApprovedFieldUpdates({
        contextId,
        contextType,
        patch: input.patch,
        scope,
      });
      return { applied, context_id: contextId, context_type: contextType };
    },
  });
}
