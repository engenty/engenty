// RoutineShape → the canvas.
//
// A RENDERER of the model — routine-shape.ts stays the single source of what a
// routine is. This file only answers where things sit: three left-to-right
// bands (wake source · what runs · outcome), with the middle band reusing the
// canvas's own vertical stacking rules (estimateNodeHeight, LAYOUT_GAP_Y)
// rather than inventing a second layout engine. Action-target step ids pass
// through from `actionSpine` untouched, so a later run overlay keyed on entry
// ids maps onto these nodes for free.
import {
  estimateNodeHeight,
  LAYOUT_GAP_Y,
} from "../workflow-canvas/graph-model.js";
import type {
  OutcomeNodeData,
  TriggerNodeData,
} from "./routine-canvas-nodes.js";
import type { RoutineShape, RoutineShapeTrigger } from "./routine-shape.js";
import type { RoutineReportMode } from "./routines-api.js";

/** Node/edge shape the canvas consumes — kept structural to avoid coupling
 * this model to @xyflow's generics. */
export interface RoutineCanvasNode {
  data: Record<string, unknown>;
  id: string;
  position: { x: number; y: number };
  type: "step" | "outcome" | "trigger";
}

export interface RoutineCanvasEdge {
  id: string;
  source: string;
  sourceHandle?: string;
  target: string;
  targetHandle?: string;
}

export interface RoutineCanvasModel {
  edges: RoutineCanvasEdge[];
  /** Content height in canvas units — sizes the host container. */
  height: number;
  nodes: RoutineCanvasNode[];
}

const NODE_WIDTH = 260;
/** Horizontal air between the three bands. */
const BAND_GAP_X = 96;
/** Chip row + one detail line. */
const TRIGGER_HEIGHT = 58;
const OUTCOME_BASE_HEIGHT = 74;
/** line-clamp-4 promise text at xs/relaxed. */
const OUTCOME_TEXT_HEIGHT = 60;

function reportLine(mode: RoutineReportMode, isDe: boolean): string {
  const prefix = isDe ? "Rückmeldung: " : "Reporting: ";
  if (mode === "ask") {
    return (
      prefix + (isDe ? "Jeder Lauf, mit Rückfrage" : "Every run, and asks")
    );
  }
  if (mode === "desk_card") {
    return (
      prefix + (isDe ? "Karte nach jedem Lauf" : "A desk card after every run")
    );
  }
  return prefix + (isDe ? "Nur bei Befund" : "Only when something happened");
}

function triggerNodeData(trigger: RoutineShapeTrigger): TriggerNodeData {
  return {
    detail: trigger.detail,
    enabled: trigger.enabled,
    icon:
      trigger.kind === "event" && trigger.label === "Webhook"
        ? "webhook"
        : trigger.kind,
    label: trigger.label,
  };
}

/** Stack heights: total occupied height of a vertical band. */
function stackHeight(heights: number[], gap: number): number {
  if (heights.length === 0) {
    return 0;
  }
  return heights.reduce((sum, h) => sum + h, 0) + gap * (heights.length - 1);
}

export function routineShapeToCanvas(
  shape: RoutineShape,
  { locale = "en" }: { locale?: string } = {}
): RoutineCanvasModel {
  const isDe = locale.startsWith("de");

  // Middle band: the shape's steps in the canvas's own vocabulary. An empty
  // published Workflow still needs SOMETHING between the bands, or the picture
  // draws a wake source pointing at an outcome — a routine that does nothing.
  const steps = shape.middle.steps.length
    ? shape.middle.steps
    : [
        {
          chip: null,
          id: "empty",
          kind: "unknown" as const,
          subtitle: null,
          title: isDe
            ? "Noch keine veröffentlichten Schritte"
            : "No published steps yet",
        },
      ];

  const stepHeights = steps.map((step) =>
    estimateNodeHeight({ subtitle: step.subtitle ?? undefined })
  );
  const outcomeHeight = shape.outcome
    ? OUTCOME_BASE_HEIGHT + (shape.outcome.text ? OUTCOME_TEXT_HEIGHT : 0)
    : 0;

  const triggers = shape.triggers;
  const triggerHeights = triggers.map((trigger) =>
    trigger.detail ? TRIGGER_HEIGHT : TRIGGER_HEIGHT - 14
  );
  const triggerTotal = stackHeight(triggerHeights, LAYOUT_GAP_Y);
  const middleTotal = stackHeight(stepHeights, LAYOUT_GAP_Y);
  const overall = Math.max(middleTotal, triggerTotal, outcomeHeight);

  const nodes: RoutineCanvasNode[] = [];
  const edges: RoutineCanvasEdge[] = [];

  // The wake sources — a vertical band, one node per trigger. A routine
  // carries 1..n; a bare Action has none and its steps band moves to the
  // left edge.
  let triggerY = (overall - triggerTotal) / 2;
  for (const [index, trigger] of triggers.entries()) {
    nodes.push({
      data: triggerNodeData(trigger),
      id: `trigger:${trigger.id}`,
      position: { x: 0, y: triggerY },
      type: "trigger",
    });
    triggerY += (triggerHeights[index] ?? TRIGGER_HEIGHT) + LAYOUT_GAP_Y;
  }

  // The middle stack — ids pass through so run state can find them later.
  const middleX = triggers.length > 0 ? NODE_WIDTH + BAND_GAP_X : 0;
  let y = (overall - middleTotal) / 2;
  for (const [index, step] of steps.entries()) {
    nodes.push({
      data: {
        args: {},
        entryIds: [step.id],
        entryIndex: index,
        kind: step.kind,
        title: step.title,
        ...(step.chip ? { chip: step.chip } : {}),
        ...(step.subtitle ? { subtitle: step.subtitle } : {}),
      },
      id: step.id,
      position: { x: middleX, y },
      type: "step",
    });
    y += (stepHeights[index] ?? 0) + LAYOUT_GAP_Y;
  }

  const firstStep = steps[0];
  const lastStep = steps.at(-1);

  if (firstStep) {
    for (const trigger of triggers) {
      edges.push({
        id: `trigger:${trigger.id}->${firstStep.id}`,
        source: `trigger:${trigger.id}`,
        target: firstStep.id,
        // Into the SIDE, not the top: this view reads left to right, and the
        // top handle stays the Action's own inbound edge.
        targetHandle: "side-in",
      });
    }
  }

  // Step joins down the middle band (top/bottom handles, like the Action view).
  for (let index = 1; index < steps.length; index += 1) {
    const from = steps[index - 1];
    const to = steps[index];
    if (from && to) {
      edges.push({
        id: `${from.id}->${to.id}`,
        source: from.id,
        target: to.id,
      });
    }
  }

  // Outcome, vertically centred on the whole picture. A bare Action promises
  // nothing, so it draws no outcome band.
  if (shape.outcome) {
    nodes.push({
      data: {
        label: isDe ? "Ergebnis" : "Outcome",
        placeholder: isDe
          ? "Noch kein Ergebnis festgelegt."
          : "No outcome declared yet.",
        reportLine: reportLine(shape.outcome.report, isDe),
        text: shape.outcome.text,
      } satisfies OutcomeNodeData,
      id: "outcome",
      position: {
        x: middleX + NODE_WIDTH + BAND_GAP_X,
        y: (overall - outcomeHeight) / 2,
      },
      type: "outcome",
    });
    if (lastStep) {
      edges.push({
        id: `${lastStep.id}->outcome`,
        source: lastStep.id,
        // Out the SIDE — the canvas's existing right anchor — mirroring how
        // the wake source came in. Bottom stays the Action view's own
        // outbound edge.
        sourceHandle: "loop-out",
        target: "outcome",
      });
    }
  }

  return { edges, height: overall, nodes };
}
