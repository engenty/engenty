// The routine's own shape, as data:
//
//   [wake source] ──▶ [ what runs ] ──▶ [ delivery ] (one per target)
//
// This is a RENDERING of the model, not a second model. A routine is one row in
// `ai.routines`: the wake source is its own `kind` + cron/event fields, "what
// runs" is the bound workflow (`workflow_id` — a published Workflow), and each
// delivery (`ai.routine_outcomes`) is something that happens with a run's
// result. The routine's goal is an instruction to the model, not drawn here.
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
  RoutineOutcomeDto,
  RoutineOutcomeMode,
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

/** One destination, as display data under the promise. */
export interface RoutineShapeBinding {
  /** What this delivery is for, when someone said. */
  description: string | null;
  enabled: boolean;
  id: string;
  label: string;
  mode: RoutineOutcomeMode;
  modeLabel: string;
}

export interface RoutineShapeOutcome {
  bindings: RoutineShapeBinding[];
  /** Shown when report is `ask`, even if destinations replace the desk post. */
  holdLine: string | null;
  report: RoutineReportMode;
}

export interface RoutineShape {
  middle: RoutineShapeMiddle;
  /** Null when the shape draws a bare Action — no routine, so no promise. */
  outcome: RoutineShapeOutcome | null;
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

const BUILTIN_OUTCOME_LABELS: Record<string, { de: string; en: string }> = {
  "agent.message": { de: "Engenty-Nachricht", en: "Engenty message" },
  "artifact.pointer": { de: "Artefakt-Hinweis", en: "Artifact pointer" },
  "desk.chat": { de: "Schreibtisch-Chat", en: "Desk chat" },
  email: { de: "E-Mail", en: "Email" },
  "notification.high": {
    de: "Update mit Priorität",
    en: "High-priority update",
  },
  "notification.update": { de: "Inbox-Update", en: "Inbox update" },
  webhook: { de: "Webhook", en: "Webhook" },
};

function outcomeModeLabel(mode: RoutineOutcomeMode, isDe: boolean): string {
  if (mode === "agent") {
    return isDe ? "Wenn der Lauf es aufruft" : "When the run calls it";
  }
  return isDe ? "Jeder Lauf" : "Every run";
}

/** One destination as display data — a row on the outcome node and list. */
export function outcomeDisplay(
  row: RoutineOutcomeDto,
  locale = "en",
  catalogLabel?: string
): RoutineShapeBinding {
  const isDe = locale.startsWith("de");
  const builtin = BUILTIN_OUTCOME_LABELS[row.provider_id];
  return {
    description: row.description?.trim() || null,
    enabled: row.enabled,
    id: row.id,
    label:
      catalogLabel ?? (isDe ? builtin?.de : builtin?.en) ?? row.provider_id,
    mode: row.mode,
    modeLabel: outcomeModeLabel(row.mode, isDe),
  };
}

/** Every destination of the routine, in display shape. */
export function routineOutcomes(
  routine: RoutineDto,
  locale = "en"
): RoutineShapeBinding[] {
  return (routine.outcomes ?? []).map((row) => outcomeDisplay(row, locale));
}

/**
 * What wakes the routine, in one line: the enabled triggers' detail ("Every
 * 30 minutes", "/daily", "Webhook") joined with a middle dot, the kind's
 * name when a trigger has no detail. Null when nothing wakes it.
 */
export function routineTriggerLine(
  routine: RoutineDto,
  locale = "en"
): string | null {
  // The card has no room for the zone; the detail page still names it.
  const parts = (routine.triggers ?? [])
    .filter((trigger) => trigger.enabled)
    .map((trigger) => {
      if (trigger.kind === "schedule" && trigger.cron) {
        return cronToHumanLabel(trigger.cron, locale, trigger.timezone, {
          showTimezone: false,
        });
      }
      const display = triggerDisplay(trigger, locale);
      return display.detail ?? display.label;
    });
  return parts.length ? parts.join(" · ") : null;
}

/**
 * Where a fire delivers, in one line: the enabled destinations' labels joined
 * with a middle dot. Null when the routine has none — the report floor
 * (`report`) then decides what a run leaves behind.
 */
export function routineOutcomeLine(
  routine: RoutineDto,
  locale = "en"
): string | null {
  const labels = routineOutcomes(routine, locale)
    .filter((binding) => binding.enabled)
    .map((binding) => binding.label);
  return labels.length ? labels.join(" · ") : null;
}

function outcomeHoldLine(
  report: RoutineReportMode,
  isDe: boolean
): string | null {
  if (report !== "ask") {
    return null;
  }
  return isDe ? "Hält den Lauf zur Rückfrage" : "Holds the run for review";
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
    outcome: routine
      ? {
          bindings: routineOutcomes(routine, locale),
          holdLine: outcomeHoldLine(routine.report, locale.startsWith("de")),
          report: routine.report,
        }
      : null,
    triggers: routine ? routineTriggers(routine, locale) : [],
  };
}
