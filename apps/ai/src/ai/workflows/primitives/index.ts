// The complete set of tools a stored action graph may reference.
//
// Security invariant (PLAN-workflow-designer.md §6): a graph's `tool` entries
// resolve ONLY against this map. Save-time validation rejects any `toolId`
// outside it, and rehydration is given exactly these — so a graph cannot name a
// module operation directly, only `engenty_tool`, which runs the gateway's
// capability check. Every primitive is generic: tenant identity comes from the
// request context, never from graph JSON.
import {
  APPLY_FIELD_UPDATES_PRIMITIVE_ID,
  createApplyFieldUpdatesPrimitive,
} from "./apply-field-updates.js";
import {
  APPROVAL_GATE_PRIMITIVE_ID,
  createApprovalGatePrimitive,
} from "./approval-gate.js";
import { createArtifactPrimitives } from "./artifacts.js";
import {
  createEngentyToolPrimitive,
  ENGENTY_TOOL_PRIMITIVE_ID,
} from "./engenty-tool.js";
import { createShowObjectsPrimitive, createShowUiPrimitive } from "./render.js";
import {
  createRunSpecialistPrimitive,
  RUN_SPECIALIST_PRIMITIVE_ID,
} from "./run-specialist.js";
import {
  createWaitUntilPrimitive,
  WAIT_UNTIL_PRIMITIVE_ID,
} from "./wait-until.js";

export { SHOW_OBJECTS_TOOL_ID } from "../../../../ai/tools/show-objects-tool.js";
export { SHOW_UI_TOOL_ID } from "../../../../ai/tools/show-ui-tool.js";
// The id list itself lives in `../primitive-ids.js` (dependency-free, so the
// pure validator can import it without dragging in the agent runtime). Re-exported
// here rather than restated: two hand-maintained copies of "which primitives
// exist" is exactly the drift that lets a tool run but fail validation.
export {
  GRAPH_ACTION_PRIMITIVE_IDS,
  type GraphActionPrimitiveId,
  isGraphActionPrimitiveId,
} from "../primitive-ids.js";
export { APPLY_FIELD_UPDATES_PRIMITIVE_ID } from "./apply-field-updates.js";
export { APPROVAL_GATE_PRIMITIVE_ID } from "./approval-gate.js";
export {
  ARTIFACT_READ_PRIMITIVE_ID,
  ARTIFACT_WRITE_PRIMITIVE_ID,
  SHOW_ARTIFACT_PRIMITIVE_ID,
} from "./artifacts.js";
export { ENGENTY_TOOL_PRIMITIVE_ID } from "./engenty-tool.js";
export { RUN_SPECIALIST_PRIMITIVE_ID } from "./run-specialist.js";
export { WAIT_UNTIL_PRIMITIVE_ID } from "./wait-until.js";

/**
 * Build the primitive tool map passed to the Mastra instance a graph run is
 * rehydrated against. Constructed per dispatch — primitives are stateless, so
 * this is cheap, and it keeps tenant graphs off any shared registry.
 */
export function createGraphActionPrimitives() {
  return {
    [RUN_SPECIALIST_PRIMITIVE_ID]: createRunSpecialistPrimitive(),
    [ENGENTY_TOOL_PRIMITIVE_ID]: createEngentyToolPrimitive(),
    [APPROVAL_GATE_PRIMITIVE_ID]: createApprovalGatePrimitive(),
    [APPLY_FIELD_UPDATES_PRIMITIVE_ID]: createApplyFieldUpdatesPrimitive(),
    [WAIT_UNTIL_PRIMITIVE_ID]: createWaitUntilPrimitive(),
    ...createArtifactPrimitives(),
    show_objects: createShowObjectsPrimitive(),
    show_ui: createShowUiPrimitive(),
  };
}
