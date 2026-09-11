// The routine's own shape, as data:
//
//   [wake source] ──▶ [ what runs ] ──▶ [ outcome ]
//
// This is a RENDERING of the model, not a second model. A routine is one row in
// `ai.routines`: the wake source is its own `kind` + cron/event fields, "what
// runs" is the bound workflow (`workflow_id` — a published Workflow), and the
// outcome is the promise the routine declares.
//
// The middle is the bound Action's spine, ALWAYS a list of steps: the picture
// does not change KIND when the Action grows steps, it only gets longer.
import type {
  CanvasNodeKind,
  StoredGraph,
} from "../workflow-canvas/graph-model.js";
import { storedGraphToCanvas } from "../workflow-canvas/graph-model.js";
import type {
  RoutineDto,
  RoutineReportMode,
  RoutineTriggerDto,
} from "./routines-api.js";
import { cronToHumanLabel } from "./schedule-cron.js";

/** One wake source, as display data. `id` is the trigger row's id. */
export interface RoutineShapeTrigger {
  detail: string | null;
  enabled: boolean;
  id: string;
  kind: "schedule" | "event" | "manual" | "agent";
  label: string;
}

/** One step of the middle, in the canvas's own vocabulary. */
export interface RoutineShapeStep {
  /** Overrides the kind chip where the kind is ambiguous (loop vs. for-each). */
  chip: string | null;
  id: string;
  kind: CanvasNodeKind;
  subtitle: string | null;
  title: string;
}

export interface RoutineShapeMiddle {
  /** True while the bound Action's graph is still loading — steps unknown. */
  pending: boolean;
  steps: RoutineShapeStep[];
  /** The bound workflow's graph id, for linking into the designer. */
  workflowId: string;
}

export interface RoutineShape {
  middle: RoutineShapeMiddle;
  /** Null when the shape draws a bare Action — no routine, so no promise. */
  outcome: { report: RoutineReportMode; text: string | null } | null;
  /** Empty when the shape draws a bare Action — it runs when pressed. */
  triggers: RoutineShapeTrigger[];
}

/**
 * Does this routine belong on a specialist's surface? One question: a routine
 * is owned by exactly one mounted specialist.
 */
export function routineBelongsToAgent(
  routine: RoutineDto,
  agentId: string
): boolean {
  return routine.agent_id === agentId;
}

/** One trigger row as display data — a trigger node on the canvas, a row in
 * the triggers dialog and on the routine card. */
export function triggerDisplay(
  trigger: RoutineTriggerDto,
  locale = "en"
): RoutineShapeTrigger {
  const isDe = locale.startsWith("de");
  if (trigger.kind === "event") {
    return {
      detail: trigger.resource ?? null,
      enabled: trigger.enabled,
      id: trigger.id,
      kind: "event",
      label:
        trigger.provider_id === "webhook"
          ? "Webhook"
          : isDe
            ? "Ereignis"
            : "Event",
    };
  }
  if (trigger.kind === "manual") {
    return {
      detail: trigger.shortcode ? `/${trigger.shortcode}` : null,
      enabled: trigger.enabled,
      id: trigger.id,
      kind: "manual",
      label: isDe ? "Manuell" : "Manual",
    };
  }
  if (trigger.kind === "agent") {
    return {
      detail: null,
      enabled: trigger.enabled,
      id: trigger.id,
      kind: "agent",
      label: isDe ? "Agent" : "Agent",
    };
  }
  return {
    detail: trigger.cron
      ? cronToHumanLabel(trigger.cron, locale, trigger.timezone)
      : null,
    enabled: trigger.enabled,
    id: trigger.id,
    kind: "schedule",
    label: isDe ? "Zeitplan" : "Schedule",
  };
}

/** Every wake source of the routine, in display shape. */
export function routineTriggers(
  routine: RoutineDto,
  locale = "en"
): RoutineShapeTrigger[] {
  return (routine.triggers ?? []).map((trigger) =>
    triggerDisplay(trigger, locale)
  );
}

/**
 * The graph's top-level steps, in order. Container children (a branch's arms,
 * a loop's body) are left out on purpose: this is an overview, and the canvas
 * is one click away for the inside of a container.
 */
export function actionSpine(graph: StoredGraph): RoutineShapeStep[] {
  return storedGraphToCanvas(graph)
    .nodes.filter((node) => node.data.childIndex === undefined)
    .sort(
      (left, right) =>
        (left.data.segmentIndex ?? 0) - (right.data.segmentIndex ?? 0)
    )
    .map((node) => ({
      chip: typeof node.data.chip === "string" ? node.data.chip : null,
      id: node.id,
      kind: node.data.kind,
      subtitle: node.data.subtitle ?? null,
      title: node.data.title,
    }));
}

export function buildRoutineShape({
  graph,
  locale = "en",
  routine,
  workflowId: boundWorkflowId,
}: {
  graph?: StoredGraph | null;
  locale?: string;
  /** Omit for a bare workflow — the shape then draws only the steps band. */
  routine?: RoutineDto | null;
  /** The bound workflow when no routine names one. */
  workflowId?: string;
}): RoutineShape {
  const workflowId = routine?.workflow_id ?? boundWorkflowId ?? "";
  return {
    middle: {
      workflowId,
      pending: !graph,
      steps: graph ? actionSpine(graph) : [],
    },
    outcome: routine ? { report: routine.report, text: routine.outcome } : null,
    triggers: routine ? routineTriggers(routine, locale) : [],
  };
}
