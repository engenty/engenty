// Which agents does a stored flow run?
//
// Agents never appear as `agent` entries (the validator rejects those) — they
// run through `run_specialist` tool nodes whose mapping supplies the
// `agent_type_key` constant. So "the agents of a flow" is a walk over mapping
// entries, including the ones nested inside containers (a branch's arms, a
// loop's body).
//
// This is what lets an agent surface CLAIM a flow routine: the task-level
// agent column is null on a flow target (one-of rule), but the agent did not
// stop executing — it moved into a node. Ownership is derived from here.

interface WalkableEntry {
  mapConfig?: unknown;
  step?: unknown;
  steps?: unknown;
  type?: unknown;
}

function keysOfEntry(entry: WalkableEntry, into: Set<string>): void {
  if (entry.type === "mapping" && typeof entry.mapConfig === "string") {
    try {
      const parsed = JSON.parse(entry.mapConfig) as Record<string, unknown>;
      const source = parsed.agent_type_key;
      if (source && typeof source === "object" && "value" in source) {
        const value = (source as { value: unknown }).value;
        if (typeof value === "string" && value.trim()) {
          into.add(value.trim());
        }
      }
    } catch {
      // An unparsable mapConfig is a validation problem, not ours.
    }
  }
  const children = Array.isArray(entry.steps)
    ? entry.steps
    : entry.step && typeof entry.step === "object"
      ? [entry.step]
      : [];
  for (const child of children) {
    if (child && typeof child === "object") {
      keysOfEntry(child as WalkableEntry, into);
    }
  }
}

/** Agent type keys a stored graph runs, in first-appearance order, deduped. */
export function collectFlowAgentKeys(
  graph: Record<string, unknown> | null | undefined
): string[] {
  const entries = Array.isArray(graph?.graph) ? graph.graph : [];
  const keys = new Set<string>();
  for (const entry of entries) {
    if (entry && typeof entry === "object") {
      keysOfEntry(entry as WalkableEntry, keys);
    }
  }
  return [...keys];
}

/**
 * Published Actions whose current version runs the given agent.
 *
 * `excludeOwnedBy` skips workflows that agent OWNS: the registry delete
 * removes those together with the agent, so only OTHER Actions — the ones
 * that would break — count as references.
 */
export async function listPublishedWorkflowsRunningAgent(input: {
  agentId: string;
  excludeOwnedBy?: string;
  tenantId: string;
}): Promise<{ id: string; name: string }[]> {
  // Lazy: this module is a leaf the ownership filter imports from the UI-side
  // helpers; pulling the store hub in at module init would risk the cycle.
  const { createWorkflowStoreFromEnv } = await import("../index.js");
  const store = createWorkflowStoreFromEnv();
  if (!store) {
    return [];
  }
  const graphs = (
    await store.list({
      status: "active",
      tenantId: input.tenantId,
    })
  ).filter(
    (graph) =>
      !input.excludeOwnedBy || graph.owner_agent_id !== input.excludeOwnedBy
  );
  const referencing: { id: string; name: string }[] = [];
  for (const graph of graphs) {
    const current = await store
      .getCurrent({ id: graph.id, tenantId: input.tenantId })
      .catch(() => null);
    if (!current) {
      continue;
    }
    const keys = collectFlowAgentKeys(current.version.graph);
    if (keys.includes(input.agentId)) {
      referencing.push({ id: graph.id, name: graph.name });
    }
  }
  return referencing;
}
