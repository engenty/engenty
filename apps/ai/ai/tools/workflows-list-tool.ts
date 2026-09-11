// workflows_list: what Workflows already exist in this workspace.
//
// `invoke_workflow` runs one BY ID and `workflow_propose` writes one, but nothing
// told a model which Workflows exist — so "use the invoicing workflow" had no
// path from a name to an id, and a writer with no view of the catalog re-proposes
// what is already there.
//
// Read-only and cheap: names, ids, status and whether a published version
// exists. The step graph is deliberately NOT returned — a model that wants to
// change a Workflow describes the change (the repair/edit round owns that), and
// dumping every Workflow's JSON into a tool result would swamp the context.
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { createWorkflowStoreFromEnv } from "../../src/ai/index.js";
import { missingRequiredFlowInputs } from "../../src/ai/workflows/flow-input.js";
import { getEngentyToolsRunContext } from "./engenty-tools/lib/run-context.js";

export const ACTIONS_LIST_TOOL_ID = "workflows_list";

/** Required properties with no default — what a caller has to send itself. */
function requiredInputNames(
  inputSchema: Record<string, unknown> | null | undefined
): string[] {
  return missingRequiredFlowInputs(inputSchema, {});
}

export const actionsListTool = createTool({
  id: ACTIONS_LIST_TOOL_ID,
  description:
    "List the Workflows in this workspace — id, name, status, and whether a " +
    "published version exists. Call this BEFORE invoke_workflow (to turn a " +
    "name into an id) and before workflow_propose (so you extend an existing " +
    "Workflow instead of duplicating it). Only `runnable: true` Workflows can " +
    "be run.",
  inputSchema: z.object({
    context_type: z
      .string()
      .optional()
      .describe(
        'Only Workflows bound to this subject type, e.g. "contacts.person".'
      ),
  }),
  outputSchema: z.object({
    workflows: z.array(
      z.object({
        workflow_id: z.string(),
        description: z.string().nullable(),
        name: z.string(),
        /** Input `invoke_workflow` MUST carry — a run without it fails outright. */
        required_input: z.array(z.string()),
        /** False for a draft-only Workflow: proposable, not yet runnable. */
        runnable: z.boolean(),
        status: z.string(),
        subject_type: z.string().nullable(),
      })
    ),
  }),
  execute: async (input) => {
    const ctx = getEngentyToolsRunContext();
    const tenantId = ctx.tenantId?.trim();
    if (!tenantId) {
      throw new Error("workflows_list is unavailable in this run (no tenant).");
    }
    const store = createWorkflowStoreFromEnv();
    if (!store) {
      throw new Error("workflow storage is not configured.");
    }
    const rows = await store.list({
      tenantId,
      ...(input.context_type ? { contextType: input.context_type } : {}),
    });
    // Discovery = the library (owner_agent_id null — the shared subset) plus
    // the calling specialist's OWN workflows. Copilot sees everything.
    const caller = ctx.agentTypeKey?.trim() ?? "";
    const management = !caller || caller === "engenty.copilot";
    const visible = management
      ? rows
      : rows.filter(
          (row) => !row.owner_agent_id || row.owner_agent_id === caller
        );
    return {
      workflows: await Promise.all(
        visible.map(async (row) => {
          // A Workflow is runnable only with a published version AND an active
          // definition — the same pair invoke_workflow enforces at dispatch.
          const runnable =
            row.current_version !== null && row.status === "active";
          // What the published version demands of a caller. Without this a
          // model reads `runnable: true` and invokes with no input, which
          // fails on the Workflow's own input schema.
          const required = runnable
            ? await store
                .getCurrent({ id: row.id, tenantId })
                .then((current) =>
                  requiredInputNames(current?.version.input_schema)
                )
                .catch(() => [])
            : [];
          return {
            workflow_id: row.id,
            description: row.description,
            name: row.title ?? row.name,
            required_input: required,
            runnable,
            status: row.status,
            subject_type: row.context_type,
          };
        })
      ),
    };
  },
});

export function createActionsListTools() {
  return { [ACTIONS_LIST_TOOL_ID]: actionsListTool };
}
