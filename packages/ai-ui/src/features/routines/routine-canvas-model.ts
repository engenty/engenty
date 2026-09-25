// RoutineShape → the canvas.
//
// A RENDERER of the model — routine-shape.ts stays the single source of what a
// routine is. This file only answers where things sit: three left-to-right
// bands (wake source · what runs · deliveries), with the middle band reusing the
// canvas's own vertical stacking rules (estimateNodeHeight, LAYOUT_GAP_Y)
// rather than inventing a second layout engine. Action-target step ids pass
// through from `actionSpine` untouched, so a later run overlay keyed on entry
// ids maps onto these nodes for free.
import {
  estimateNodeHeight,
  LAYOUT_GAP_Y,
} from "../workflow-canvas/graph-model.js";
import type {
  DeliveryNodeData,
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
  type: "step" | "delivery" | "trigger";
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
/** Chip + title + mode line. */
const DELIVERY_BASE_HEIGHT = 66;
/** line-clamp-2 description. */
const DELIVERY_DESCRIPTION_HEIGHT = 32;

/** The desk post a routine without deliveries makes instead. */
function reportTitle(mode: RoutineReportMode, isDe: boolean): string {
  if (mode === "ask") {
    return isDe
      ? "Karte am Schreibtisch, wartet auf dich"
      : "Desk card, waits for you";
  }
  if (mode === "desk_card") {
    return isDe ? "Karte am Schreibtisch" : "Desk card";
  }
  return isDe ? "Nur wenn etwas passiert ist" : "Only when something happened";
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

/**
 * What happens with a run's result, one box each: the routine's deliveries,
 * or — when it has none — the desk post it falls back to. A routine that
 * holds for review says so in its own box.
 */
function deliveryBoxes(
  outcome: NonNullable<RoutineShape["outcome"]>,
  isDe: boolean
): DeliveryNodeData[] {
  const label = isDe ? "Zustellung" : "Delivery";
  const boxes: DeliveryNodeData[] =
    outcome.bindings.length > 0
      ? outcome.bindings.map((binding) => ({
          description: binding.description,
          enabled: binding.enabled,
          id: binding.id,
          label,
          modeLabel: binding.modeLabel,
          title: binding.label,
        }))
      : [
          {
            description: null,
            enabled: true,
            id: "report",
            label,
            modeLabel: isDe ? "Jeder Lauf" : "Every run",
            title: reportTitle(outcome.report, isDe),
          },
        ];
  if (outcome.bindings.length > 0 && outcome.holdLine) {
    boxes.push({
      description: null,
      enabled: true,
      id: "hold",
      label,
      modeLabel: isDe ? "Jeder Lauf" : "Every run",
      title: outcome.holdLine,
    });
  }
  return boxes;
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
  const deliveries: DeliveryNodeData[] = shape.outcome
    ? deliveryBoxes(shape.outcome, isDe)
    : [];
  const deliveryHeights = deliveries.map(
    (box) =>
      DELIVERY_BASE_HEIGHT + (box.description ? DELIVERY_DESCRIPTION_HEIGHT : 0)
  );
  const deliveryTotal = stackHeight(deliveryHeights, LAYOUT_GAP_Y);

  const triggers = shape.triggers;
  const triggerHeights = triggers.map((trigger) =>
    trigger.detail ? TRIGGER_HEIGHT : TRIGGER_HEIGHT - 14
  );
  const triggerTotal = stackHeight(triggerHeights, LAYOUT_GAP_Y);
  const middleTotal = stackHeight(stepHeights, LAYOUT_GAP_Y);
  const overall = Math.max(middleTotal, triggerTotal, deliveryTotal);

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

  // Deliveries: one box each, a band to the right, fed by the last step. A
  // bare Action delivers nothing, so it draws no band.
  let deliveryY = (overall - deliveryTotal) / 2;
  for (const [index, box] of deliveries.entries()) {
    const id = `delivery:${box.id}`;
    nodes.push({
      data: box,
      id,
      position: { x: middleX + NODE_WIDTH + BAND_GAP_X, y: deliveryY },
      type: "delivery",
    });
    deliveryY += (deliveryHeights[index] ?? 0) + LAYOUT_GAP_Y;
    if (lastStep) {
      edges.push({
        id: `${lastStep.id}->${id}`,
        source: lastStep.id,
        // Out the SIDE — the canvas's existing right anchor — mirroring how
        // the wake source came in. Bottom stays the Action view's own
        // outbound edge.
        sourceHandle: "loop-out",
        target: id,
      });
    }
  }

  return { edges, height: overall, nodes };
}
