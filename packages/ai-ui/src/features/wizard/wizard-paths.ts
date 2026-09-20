// Where a wizard lives inside a space.
//
// `workflows` is a reserved space segment (space-module-url.ts): page 0 is
// the workflow's own address, a run is addressed by its `run_id` — the id the
// stream and the snapshot route both speak.

export const SPACE_WORKFLOWS_SEGMENT = "workflows";

/** `/s/<key>/workflows/<workflowId>` — page 0, the run input. */
export function spaceWorkflowPath(
  spaceKey: string,
  workflowId: string
): string {
  return `/s/${encodeURIComponent(spaceKey)}/${SPACE_WORKFLOWS_SEGMENT}/${encodeURIComponent(workflowId)}`;
}

/** `/s/<key>/workflows/<workflowId>/runs/<runId>` — one run, one step at a time. */
export function spaceWorkflowRunPath(
  spaceKey: string,
  workflowId: string,
  runId: string
): string {
  return `${spaceWorkflowPath(spaceKey, workflowId)}/runs/${encodeURIComponent(runId)}`;
}
