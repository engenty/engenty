// Publish → wrapper routine.
//
// "Everything is a routine": a workflow is run through one, and its trigger
// rows are the fire doors (manual = press, agent = invoke_workflow). Publishing
// a workflow that has no routine yet creates the wrapper with the standard
// manual + agent pair, so it is pressable and invokable the moment it is
// runnable — and both stay togglable. A library workflow (no owning agent)
// gets no wrapper: it exists to be referenced by other agents' routines.
import {
  createRoutineStoreFromEnv,
  createRoutineTriggerStoreFromEnv,
  createWorkflowStoreFromEnv,
} from "../index.js";

export async function wrapPublishedWorkflow(input: {
  graphId: string;
  tenantId: string;
  userId?: string | null;
}): Promise<void> {
  const flowGraphs = createWorkflowStoreFromEnv();
  const routines = createRoutineStoreFromEnv();
  const triggers = createRoutineTriggerStoreFromEnv();
  if (!(flowGraphs && routines && triggers)) {
    return;
  }
  const graph = await flowGraphs.getGraph({
    id: input.graphId,
    tenantId: input.tenantId,
  });
  if (!graph?.owner_agent_id) {
    return;
  }
  const existing = await routines.list({ tenantId: input.tenantId });
  if (existing.some((routine) => routine.workflow_id === graph.id)) {
    return;
  }
  const created = await routines.create({
    agentId: graph.owner_agent_id,
    createdByUserId: input.userId?.trim() || null,
    description: graph.description ?? null,
    name: graph.title ?? graph.name,
    source: "custom",
    tenantId: input.tenantId,
    workflowId: graph.id,
  });
  for (const kind of ["manual", "agent"] as const) {
    await triggers.create({
      kind,
      routineId: created.id,
      tenantId: input.tenantId,
    });
  }
}
