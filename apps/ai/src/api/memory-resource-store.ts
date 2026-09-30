// The memory-domain store outside a run: `ai.mastra_resources` rows, keyed
// `${tenantId}:${resourceId}` like the run-time adapter's `#resourceKey`.
// Used by the agent-desk TASKS.md routes, which read and write the same rows
// a run does.
import type { AgentTasksStore } from "../ai/memory/agent-tasks.js";

export async function getMemoryResourceStore(): Promise<AgentTasksStore | null> {
  const { mastra } = await import("../../ai/index.js");
  const storage = mastra.getStorage();
  if (!storage) {
    return null;
  }
  const store = (await Promise.resolve(
    (storage as unknown as { getStore: (domain: string) => unknown }).getStore(
      "memory"
    )
  )) as AgentTasksStore | undefined;
  return store ?? null;
}
