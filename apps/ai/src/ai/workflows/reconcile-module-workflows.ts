// Module workflows → tenant `ai.workflow` rows, reconciled at boot/heartbeat
// (PLAN-mounted-engentys T4). Ensure-on-use is gone: a press or fire
// references an existing published version or refuses, so this reconcile is
// the only thing that materializes module definitions.
//
// Validation happens HERE — the install moment — never at fire: native
// `agent` entries are translated to `mapping + run_specialist` first, then
// the graph checks run; dispatch trusts the stored graph.
import type { WorkflowDefinition } from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import type {
  WorkflowStore,
  WorkflowWithVersion,
} from "../../dal/workflows/workflow-store.js";
import { translateAgentEntries } from "./translate-agent-entries.js";
import { validateGraphAction } from "./validate-graph.js";

const logger = createLogger({ name: "reconcile-module-workflows" });

/**
 * Serialize with keys in a fixed order, so two objects that differ only in key
 * order compare equal. The stored graph comes back from `jsonb`, which does
 * NOT preserve insertion order — a plain JSON.stringify comparison reported
 * drift on every pass and minted an identical new version each time.
 */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** The definition as stored: agent entries translated, everything else verbatim. */
export function storedDefinition(
  action: WorkflowDefinition
): Record<string, unknown> {
  return {
    ...action.definition,
    graph: translateAgentEntries(action.definition.graph),
  };
}

export interface ReconcileModuleWorkflowsResult {
  created: number;
  failed: number;
  republished: number;
  /** Rows whose module workflow no longer ships — disabled, never deleted. */
  retired: number;
}

/**
 * Upsert every module workflow of ONE tenant. Auto-published: the approval
 * that governs a module workflow is installing the module — its JSON is code
 * that shipped, not tenant-authored input. Per-definition try/catch so one
 * bad declaration cannot take the rest down.
 */
export async function reconcileModuleWorkflows(options: {
  store: WorkflowStore;
  tenantId: string;
  workflows: readonly WorkflowDefinition[];
}): Promise<ReconcileModuleWorkflowsResult> {
  const { store, tenantId, workflows } = options;
  const result: ReconcileModuleWorkflowsResult = {
    created: 0,
    failed: 0,
    republished: 0,
    retired: 0,
  };
  for (const action of workflows) {
    try {
      await reconcileOne({ action, result, store, tenantId });
    } catch (err) {
      result.failed += 1;
      logger.error("module workflow reconcile failed", {
        message: err instanceof Error ? err.message : String(err),
        tenantId,
        workflowId: action.id,
      });
    }
  }
  await retireVanishedWorkflows({ result, store, tenantId, workflows });
  return result;
}

/**
 * Rows whose `source_workflow_id` no longer ships — a workflow deleted from its
 * module, or a module uninstalled. Without this, upserting was the only thing
 * reconcile could do and a removed workflow stayed `active` in the catalog for
 * good, still pressable.
 *
 * DISABLED, never deleted: past runs reference the row's versions through
 * `workflow_run`, so a delete is refused by the database and would destroy
 * run history if it were not. Disabled leaves the history readable and takes
 * the workflow out of the catalog and off every dispatch path. Reinstalling
 * the module republishes the same row and makes it active again.
 *
 * Only rows that CAME from a module are touched: an authored graph has no
 * `source_workflow_id` and is nobody's to retire.
 */
async function retireVanishedWorkflows(input: {
  result: ReconcileModuleWorkflowsResult;
  store: WorkflowStore;
  tenantId: string;
  workflows: readonly WorkflowDefinition[];
}): Promise<void> {
  const { result, store, tenantId, workflows } = input;
  const shipped = new Set(workflows.map((action) => action.id));
  const rows = await store.list({ status: "active", tenantId });
  for (const row of rows) {
    if (!row.source_workflow_id || shipped.has(row.source_workflow_id)) {
      continue;
    }
    try {
      await store.setStatus({ id: row.id, status: "disabled", tenantId });
      result.retired += 1;
      logger.info("module workflow retired", {
        tenantId,
        workflowId: row.source_workflow_id,
      });
    } catch (err) {
      result.failed += 1;
      logger.error("module workflow retire failed", {
        message: err instanceof Error ? err.message : String(err),
        tenantId,
        workflowId: row.source_workflow_id,
      });
    }
  }
}

async function reconcileOne(input: {
  action: WorkflowDefinition;
  result: ReconcileModuleWorkflowsResult;
  store: WorkflowStore;
  tenantId: string;
}): Promise<void> {
  const { action, result, store, tenantId } = input;
  const definition = storedDefinition(action);
  const issues = validateGraphAction({
    graph: action.definition.graph,
    id: action.definition.id,
    inputSchema: action.definition.inputSchema,
    outputSchema: action.definition.outputSchema,
  });
  if (issues.length > 0) {
    throw new Error(
      `workflow "${action.id}" is not a valid flow: ${issues
        .map((issue) => issue.message)
        .join("; ")}`
    );
  }

  const publish = async (graphId: string): Promise<WorkflowWithVersion> => {
    const version = await store.saveVersion({
      workflowId: graphId,
      ...(action.allowed_tools
        ? { allowedTools: [...action.allowed_tools] }
        : {}),
      authoredBy: "system",
      graph: definition,
      inputSchema: action.definition.inputSchema,
      outputSchema: action.definition.outputSchema,
      tenantId,
    });
    return store.publishVersion({ tenantId, versionId: version.id });
  };

  const existing = await store.findBySourceWorkflow({
    sourceWorkflowId: action.id,
    tenantId,
  });
  if (!existing) {
    const graph = await store.create({
      ...(action.context_type ? { contextType: action.context_type } : {}),
      ...(action.description ? { description: action.description } : {}),
      moduleId: action.module_id,
      name: action.name,
      ...(action.owner_agent_id ? { ownerAgentId: action.owner_agent_id } : {}),
      sourceWorkflowId: action.id,
      tenantId,
      title: action.name,
    });
    await publish(graph.id);
    result.created += 1;
    logger.info("module workflow published", {
      tenantId,
      workflowId: action.id,
    });
    return;
  }

  const current = await store.getCurrent({ id: existing.id, tenantId });
  if (
    current &&
    existing.status === "active" &&
    canonicalJson(current.version.graph) === canonicalJson(definition)
  ) {
    return;
  }
  await publish(existing.id);
  result.republished += 1;
  logger.info("module workflow republished", {
    tenantId,
    workflowId: action.id,
  });
}
