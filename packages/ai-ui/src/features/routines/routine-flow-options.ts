// What the routine's Action picker may offer, as a pure function.
//
// Module workflows exist as tenant rows from the boot reconcile, so the
// picker lists published graphs and nothing else: a binding may only name a
// workflow that is runnable NOW — the dispatcher re-checks published + active
// at fire time, and a draft here would only produce a nightly run that fails
// at 02:00.
import type { WorkflowDto } from "../workflow-canvas/workflow-api.js";

export interface RoutineFlowOption {
  label: string;
  /** The flow graph id the binding stores. */
  value: string;
}

export function buildRoutineFlowOptions(
  graphs: readonly WorkflowDto[]
): RoutineFlowOption[] {
  return graphs
    .filter(
      (graph) => graph.status === "active" && Boolean(graph.current_version)
    )
    .map((graph) => ({
      label: `${graph.title ?? graph.name} (v${graph.current_version})`,
      value: graph.id,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
