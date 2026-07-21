// React-query hooks for the contact "Agent notes" card. Keys live under
// contactKeys.all so the contacts live binding (which also watches
// module_memory.records) invalidates them when an agent writes a memory.
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import { archiveMemoryRecord, listContactMemories } from "./api/memory.js";
import { contactKeys } from "./queries.js";

export const contactMemoryKeys = {
  entity: (entityRef: string) =>
    [...contactKeys.all, "agent-notes", entityRef] as const,
};

export function useContactMemoriesQuery(entityRef: string) {
  return useQuery({
    queryKey: contactMemoryKeys.entity(entityRef),
    queryFn: ({ signal }) => listContactMemories(entityRef, signal),
    // A 403 (no module.memory.read) or missing memory module renders as an
    // absent card, not an error toast.
    retry: false,
  });
}

export function useArchiveContactMemoryMutation(entityRef: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => archiveMemoryRecord(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: contactMemoryKeys.entity(entityRef),
      });
    },
  });
}
