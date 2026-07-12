import { useEffect, useState } from "react";
import type { Task } from "../../src/schema/types.js";
import { getTasksListEnrichers } from "../list-hooks.js";

export type TasksListEnrichmentState = Record<string, Record<string, unknown>>;

export function useTasksListEnrichments(tasks: Task[]) {
  const [enrichments, setEnrichments] = useState<TasksListEnrichmentState>({});

  useEffect(() => {
    const enrichers = getTasksListEnrichers();
    if (tasks.length === 0 || enrichers.length === 0) {
      setEnrichments({});
      return;
    }

    let cancelled = false;

    void Promise.all(
      enrichers.map(async (enricher) => {
        try {
          const data = await enricher.enrich(tasks);
          return { id: enricher.id, data };
        } catch {
          return { id: enricher.id, data: {} };
        }
      })
    ).then((results) => {
      if (cancelled) {
        return;
      }

      const next: TasksListEnrichmentState = {};
      for (const task of tasks) {
        next[task.id] = {};
      }

      for (const result of results) {
        for (const [taskId, value] of Object.entries(result.data)) {
          next[taskId] = {
            ...(next[taskId] ?? {}),
            [result.id]: value,
          };
        }
      }

      setEnrichments(next);
    });

    return () => {
      cancelled = true;
    };
  }, [tasks]);

  return enrichments;
}
