/**
 * Compact, agent-friendly project snapshot for Agent UI state page.project_snapshot.
 * Keeps token usage low (~200-600 tokens) while enabling basic summaries without tool calls.
 */
import type { ProjectWithPhasesAndTasks } from "./api.js";

/**
 * Kept as type aliases (not interfaces) so they get implicit index signatures
 * and stay assignable to the `Record<string, JsonValue>` Agent UI page shape.
 */
// biome-ignore lint/style/useConsistentTypeDefinitions: type alias required for JsonValue index signature
export type ProjectSnapshotPhase = {
  tasks: { title: string; status: string }[];
  title: string;
};

// biome-ignore lint/style/useConsistentTypeDefinitions: type alias required for JsonValue index signature
export type ProjectSnapshot = {
  client_name: string | null;
  end_date: string | null;
  phases: ProjectSnapshotPhase[];
  start_date: string | null;
  title: string;
};

/** Build a compact project snapshot for Agent UI state. */
export function buildProjectSnapshot(
  project: ProjectWithPhasesAndTasks
): ProjectSnapshot {
  const phases: ProjectSnapshotPhase[] = (project.phases ?? []).map((p) => ({
    title: String(p.title ?? ""),
    tasks: (p.tasks ?? []).map((t) => ({
      title: String(t.title ?? ""),
      status: String(t.status ?? "todo"),
    })),
  }));
  return {
    title: String(project.title ?? ""),
    client_name: project.client_name ?? null,
    start_date: project.start_date ?? null,
    end_date: project.end_date ?? null,
    phases,
  };
}
