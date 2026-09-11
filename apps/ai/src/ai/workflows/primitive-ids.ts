// The primitive ids, with NO runtime dependencies.
//
// Split out from `primitives/index.ts` deliberately: the save-path validator is
// a pure function over JSON, but importing the primitive *implementations* to
// get their ids drags in the whole agent runtime (registry, delegate-run, the
// copilot's tool list) — which imports the propose tool, which imports the
// validator. That cycle left `GRAPH_RUN_CONTEXT` undefined at module-init time
// and took the validator's test suite down with it.
//
// Anything that only needs to know WHICH tools exist imports this. Anything
// that needs to RUN them imports `primitives/index.js`.

export const RUN_SPECIALIST_PRIMITIVE_ID = "run_specialist";
export const ENGENTY_TOOL_PRIMITIVE_ID = "engenty_tool";
export const APPROVAL_GATE_PRIMITIVE_ID = "approval_gate";
export const APPLY_FIELD_UPDATES_PRIMITIVE_ID = "apply_field_updates";
export const WAIT_UNTIL_PRIMITIVE_ID = "wait_until";
// Deliverables and presentation. These carry the SAME ids as the agent tools
// they delegate to, so a node and a specialist call are one thing to learn.
export const ARTIFACT_WRITE_PRIMITIVE_ID = "artifact_write";
export const ARTIFACT_READ_PRIMITIVE_ID = "artifact_read";
export const SHOW_ARTIFACT_PRIMITIVE_ID = "show_artifact";
export const SHOW_UI_PRIMITIVE_ID = "show_ui";
export const SHOW_OBJECTS_PRIMITIVE_ID = "show_objects";

/** Every primitive id, for save-time validation of a graph's tool references. */
export const GRAPH_ACTION_PRIMITIVE_IDS = [
  RUN_SPECIALIST_PRIMITIVE_ID,
  ENGENTY_TOOL_PRIMITIVE_ID,
  APPROVAL_GATE_PRIMITIVE_ID,
  APPLY_FIELD_UPDATES_PRIMITIVE_ID,
  WAIT_UNTIL_PRIMITIVE_ID,
  ARTIFACT_WRITE_PRIMITIVE_ID,
  ARTIFACT_READ_PRIMITIVE_ID,
  SHOW_ARTIFACT_PRIMITIVE_ID,
  SHOW_UI_PRIMITIVE_ID,
  SHOW_OBJECTS_PRIMITIVE_ID,
] as const;

export type GraphActionPrimitiveId =
  (typeof GRAPH_ACTION_PRIMITIVE_IDS)[number];

export function isGraphActionPrimitiveId(
  id: string
): id is GraphActionPrimitiveId {
  return (GRAPH_ACTION_PRIMITIVE_IDS as readonly string[]).includes(id);
}
