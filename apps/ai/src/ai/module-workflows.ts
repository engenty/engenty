// Assembles the effective action set for the current request: in-process
// registrations (apps/ai-local) plus module workflow definitions delivered
// over the core module-capability channel. The loader is tenant-scoped — it
// only returns capabilities for plugins enabled for the caller's tenant, the
// same scoping module agents get via ModuleProvider.
//
// Definitions are verbatim Mastra workflow JSON; input validation happens
// against the stored `inputSchema` (assertFlowInput), never by
// re-materializing a zod schema.
import {
  type DynamicAiModuleCapabilityLoader,
  listRegisteredWorkflows,
  type WorkflowDefinition,
} from "@engenty/ai-core";

export async function listAllWorkflows(
  moduleLoader?: DynamicAiModuleCapabilityLoader
): Promise<WorkflowDefinition[]> {
  const local = listRegisteredWorkflows();
  if (!moduleLoader) {
    return local;
  }
  const localIds = new Set(local.map((action) => action.id));
  const capabilities = await moduleLoader.listModuleCapabilities();
  const moduleActions = capabilities
    .flatMap((capability) => capability.workflows ?? [])
    .filter((action) => !localIds.has(action.id));
  return [...local, ...moduleActions];
}

export async function resolveWorkflowById(
  workflowId: string,
  moduleLoader?: DynamicAiModuleCapabilityLoader
): Promise<WorkflowDefinition | undefined> {
  const all = await listAllWorkflows(moduleLoader);
  return all.find((action) => action.id === workflowId);
}
