// The live Mastra instance, published for system jobs.
//
// System jobs execute inside the schedule `prepare` hook with only
// `{ db, tenantId }` — the hooks are constructed BEFORE the Mastra instance
// they are passed into, so a job that needs `mastra.schedules` (the
// `scheduler-sync` job) reads it from this ref, set once the scheduler comes
// online. Null means the scheduler never started (no service credential) —
// and then no schedule exists to fire the job anyway.
import type { Mastra } from "@mastra/core/mastra";

let schedulerMastra: Mastra | null = null;

export function setSchedulerMastra(mastra: Mastra): void {
  schedulerMastra = mastra;
}

export function getSchedulerMastra(): Mastra | null {
  return schedulerMastra;
}

/** Test seam. */
export function resetSchedulerMastraForTests(): void {
  schedulerMastra = null;
}
