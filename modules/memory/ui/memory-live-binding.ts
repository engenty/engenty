import type { ModuleLiveBinding } from "@engenty/live-cache";
import { memoryKeys } from "./queries.js";

/**
 * Reactive-data declaration for the memory module: any module_memory.records
 * change (agent save, reflection, consolidation, approval) invalidates the
 * memory query subtree; memory tool calls invalidate immediately without
 * waiting for the realtime round-trip.
 */
export const memoryLiveBinding: ModuleLiveBinding = {
  id: "memory",
  queryRoot: memoryKeys.all,
  postgresChanges: [{ schema: "module_memory", table: "records" }],
  agentToolIds: ["memory_save", "memory_record_archive"],
};
