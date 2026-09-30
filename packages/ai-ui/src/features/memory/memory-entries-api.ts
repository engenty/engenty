// Memory entries over /ai/v1/memory/entries — one list per key: a person's
// own facts (`user`), a Space's (`space`), the company's (`company`), or an
// agent's own notes (`agent`, per Space or per person) — plus the key's
// working memory (/ai/v1/memory/working). Server:
// apps/ai `api/memory-entry-routes.ts`.
import type {
  MemoryScope,
  WorkingMemoryPatch,
  WorkingMemoryState,
} from "@engenty/ai-core/browser";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import { requestAiServiceJson } from "../../lib/runtime/ai-service-client.js";

export interface MemoryEntryKeyInput {
  agentId?: string | null;
  scope: MemoryScope;
  spaceId?: string | null;
}

export interface MemoryEntryDto {
  body: string;
  created_at: string;
  created_by_user_id: string | null;
  id: string;
  short_id: string;
  updated_at: string;
}

export interface MemoryEntriesDto {
  can_edit: boolean;
  characters: number;
  entries: MemoryEntryDto[];
  max_chars: number;
  working: { state: WorkingMemoryState; updated_at: string | null };
}

export const memoryEntryKeys = {
  all: ["memory-entries"] as const,
  list: (input: MemoryEntryKeyInput) =>
    [
      "memory-entries",
      input.scope,
      input.spaceId ?? "",
      input.agentId ?? "",
    ] as const,
};

function queryString(input: MemoryEntryKeyInput): string {
  const query = new URLSearchParams({ scope: input.scope });
  if (input.agentId) {
    query.set("agent_id", input.agentId);
  }
  if (input.spaceId) {
    query.set("space_id", input.spaceId);
  }
  return query.toString();
}

const BASE = "/ai/v1/memory/entries";

export function useMemoryEntriesQuery(
  input: MemoryEntryKeyInput,
  options?: { enabled?: boolean }
) {
  return useQuery({
    enabled: options?.enabled ?? true,
    queryFn: ({ signal }) =>
      requestAiServiceJson<MemoryEntriesDto>(`${BASE}?${queryString(input)}`, {
        signal,
      }),
    queryKey: memoryEntryKeys.list(input),
    staleTime: 10_000,
  });
}

/** Add, edit and remove for one list; each refreshes it. */
export function useMemoryEntryMutations(input: MemoryEntryKeyInput) {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: memoryEntryKeys.list(input) });
  const add = useMutation({
    mutationFn: (body: string) =>
      requestAiServiceJson<{ ok: boolean }>(`${BASE}?${queryString(input)}`, {
        body: JSON.stringify({ body }),
        method: "POST",
      }),
    onSuccess: refresh,
  });
  const edit = useMutation({
    mutationFn: (entry: { body: string; id: string }) =>
      requestAiServiceJson<{ entry: MemoryEntryDto }>(
        `${BASE}/${encodeURIComponent(entry.id)}?${queryString(input)}`,
        { body: JSON.stringify({ body: entry.body }), method: "PATCH" }
      ),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      requestAiServiceJson<{ ok: boolean }>(
        `${BASE}/${encodeURIComponent(id)}?${queryString(input)}`,
        { method: "DELETE" }
      ),
    onSuccess: refresh,
  });
  const setWorking = useMutation({
    mutationFn: (fields: WorkingMemoryPatch) =>
      requestAiServiceJson<{ working: { state: WorkingMemoryState } }>(
        `/ai/v1/memory/working?${queryString(input)}`,
        { body: JSON.stringify({ fields }), method: "PATCH" }
      ),
    onSuccess: refresh,
  });
  return { add, edit, remove, setWorking };
}
