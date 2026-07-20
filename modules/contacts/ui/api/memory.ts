// Agent-notes data access (memory Phase 3): entity-scoped memory records for
// a contact, via the memory module's gateway operations (memory has no REST
// surface — ops only, same invoke pattern as modules/secrets/ui/api.ts).
import { requestApiJson } from "@engenty/api-client";

export interface AgentMemoryRecord {
  agent_type_key: string | null;
  body_md: string;
  confidence: "low" | "medium" | "high";
  id: string;
  kind: "fact" | "preference" | "lesson" | "decision" | "guideline";
  scope_kind: string;
  scope_ref: string | null;
  slug: string;
  source_kind: "agent" | "reflection" | "human";
  status: string;
  title: string;
  updated_at: string;
}

async function invokeOperation<T>(
  operationId: string,
  input: unknown,
  signal?: AbortSignal
): Promise<T> {
  return await requestApiJson<T>(`/api/operations/${operationId}/invoke`, {
    method: "POST",
    body: { input },
    signal,
  });
}

/** Memory entity ref for a contact — mirrors the context-graph type ids. */
export function contactEntityRef(entity: {
  id: string;
  type: string;
}): string {
  const typeId =
    entity.type === "organisation" ? "contacts.organisation" : "contacts.person";
  return `${typeId}:${entity.id}`;
}

export async function listContactMemories(
  entityRef: string,
  signal?: AbortSignal
): Promise<AgentMemoryRecord[]> {
  const result = await invokeOperation<{ rows?: AgentMemoryRecord[] }>(
    "memory_record_list",
    {
      limit: 20,
      scope_kind: "entity",
      scope_ref: entityRef,
      status: "active",
    },
    signal
  );
  return Array.isArray(result?.rows) ? result.rows : [];
}

export async function archiveMemoryRecord(id: string): Promise<void> {
  await invokeOperation("memory_record_archive", { id });
}
