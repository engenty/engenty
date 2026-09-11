// Working-memory profile ("what the assistant knows about you") — read-only
// view + reset over /ai/v1/memory/working. The profile itself is maintained by
// the agent via the auto-registered updateWorkingMemory tool. The copilot's
// TASKS.md (its own open items, editable) rides the same row under
// /ai/v1/memory/working/tasks.
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import { requestAiServiceJson } from "../../lib/runtime/ai-service-client.js";

export interface WorkingMemoryDto {
  updated_at: string | null;
  working_memory: string | null;
}

export const workingMemoryKeys = {
  all: ["working-memory"] as const,
  tasks: ["working-memory", "tasks"] as const,
};

export interface CopilotTasksDto {
  enabled: boolean;
  max_chars: number;
  tasks: string;
}

export function useCopilotTasksQuery() {
  return useQuery({
    queryFn: ({ signal }) =>
      requestAiServiceJson<CopilotTasksDto>("/ai/v1/memory/working/tasks", {
        signal,
      }),
    queryKey: workingMemoryKeys.tasks,
    staleTime: 10_000,
  });
}

export function useSaveCopilotTasksMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tasks: string) =>
      requestAiServiceJson<CopilotTasksDto>("/ai/v1/memory/working/tasks", {
        body: JSON.stringify({ tasks }),
        method: "PUT",
      }),
    onSuccess: (result: CopilotTasksDto) => {
      queryClient.setQueryData(workingMemoryKeys.tasks, result);
    },
  });
}

export function useWorkingMemoryQuery() {
  return useQuery({
    queryKey: workingMemoryKeys.all,
    queryFn: ({ signal }) =>
      requestAiServiceJson<WorkingMemoryDto>("/ai/v1/memory/working", {
        signal,
      }),
    staleTime: 10_000,
  });
}

export function useResetWorkingMemoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      requestAiServiceJson<{ ok: boolean }>("/ai/v1/memory/working", {
        method: "DELETE",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workingMemoryKeys.all });
    },
  });
}

/** Parse the stored profile (schema-form working memory persists JSON). */
export function parseWorkingMemoryProfile(
  workingMemory: string | null
): Record<string, unknown> | null {
  if (!workingMemory?.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(workingMemory) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
