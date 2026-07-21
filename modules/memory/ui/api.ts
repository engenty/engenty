// Memory document data access: the module's gateway operations via the
// shared /api/operations invoke endpoint (same pattern as modules/secrets).
import { requestApiJson } from "@engenty/api-client";
import type { MemoryRecord } from "../src/schema/zod.js";
import type { MemoryDocOp } from "../src/services/memory-doc.js";

export type { MemoryRecord } from "../src/schema/zod.js";

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

export interface MemoryScopeQuery {
  scope_kind: "user" | "project" | "org" | "entity";
  scope_ref: string | null;
}

export async function listScopeRecords(
  scope: MemoryScopeQuery,
  signal?: AbortSignal
): Promise<MemoryRecord[]> {
  // Active + proposed both render (proposed = the amber approval queue);
  // archived rows never enter the document.
  const [active, proposed] = await Promise.all([
    invokeOperation<{ rows?: MemoryRecord[] }>(
      "memory_record_list",
      { limit: 200, status: "active", ...scope },
      signal
    ),
    invokeOperation<{ rows?: MemoryRecord[] }>(
      "memory_record_list",
      { limit: 200, status: "proposed", ...scope },
      signal
    ),
  ]);
  return [...(active.rows ?? []), ...(proposed.rows ?? [])];
}

/** Distinct scope_refs that already hold memories (project/entity pickers). */
export async function listScopeRefs(
  scopeKind: "project" | "entity",
  signal?: AbortSignal
): Promise<string[]> {
  const result = await invokeOperation<{ rows?: MemoryRecord[] }>(
    "memory_record_list",
    { limit: 200, scope_kind: scopeKind },
    signal
  );
  const refs = new Set<string>();
  for (const row of result.rows ?? []) {
    if (row.scope_ref && row.status !== "archived") {
      refs.add(row.scope_ref);
    }
  }
  return [...refs].sort();
}

export class MemoryConflictError extends Error {
  constructor() {
    super("memory_record_conflict");
    this.name = "MemoryConflictError";
  }
}

function isConflict(error: unknown): boolean {
  return (
    error instanceof Error && error.message.includes("memory_record_conflict")
  );
}

/** Execute the diff-sync ops sequentially; a 409 aborts with MemoryConflictError. */
export async function applyMemoryDocOps(
  scope: MemoryScopeQuery,
  ops: MemoryDocOp[]
): Promise<void> {
  for (const op of ops) {
    try {
      if (op.op === "archive") {
        await invokeOperation("memory_record_archive", { id: op.recordId });
      } else {
        await invokeOperation("memory_record_upsert", {
          body_md: op.bodyMd,
          kind: op.kind,
          scope_kind: scope.scope_kind,
          ...(scope.scope_ref ? { scope_ref: scope.scope_ref } : {}),
          slug: op.slug,
          title: op.title,
          ...(op.op === "update" && op.updatedAt
            ? { expected_updated_at: op.updatedAt }
            : {}),
        });
      }
    } catch (error) {
      if (isConflict(error)) {
        throw new MemoryConflictError();
      }
      throw error;
    }
  }
}

export async function approveMemoryRecord(id: string): Promise<void> {
  await invokeOperation("memory_record_approve", { id });
}

export async function archiveMemoryRecord(id: string): Promise<void> {
  await invokeOperation("memory_record_archive", { id });
}
