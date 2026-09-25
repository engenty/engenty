// The routine, drawn — on the same canvas workflows use.
//
// Same reading ([wake source] → [what runs] → [outcome]) and same model
// (routine-shape.ts), rendered through ReactFlow so the routine picture and
// the workflow canvas are one visual system — the routine is that canvas zoomed
// out one level.
//
// Two densities:
//   detail  — pan/zoom, controls, click a flow step to open the designer.
//   compact — a STATIC picture for expanded list rows: no pan, no zoom, no
//             controls, scrolling passes through to the page. One instance
//             per EXPANDED row only; collapsed rows render nothing.
import { cn, Skeleton } from "@engenty/ui-core";
import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  type Node,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
// After the library sheet — overrides its hard-coded light chrome.
import "../workflow-canvas/workflow-canvas.css";
import { useMemo } from "react";
import type { StoredGraph } from "../workflow-canvas/graph-model.js";
import { useWorkflowQuery } from "../workflow-canvas/workflow-queries.js";
import { routineShapeToCanvas } from "./routine-canvas-model.js";
import { routineNodeTypes } from "./routine-canvas-nodes.js";
import { buildRoutineShape } from "./routine-shape.js";
import type { RoutineDto } from "./routines-api.js";

export interface RoutineCanvasProps {
  className?: string;
  /**
   * Draw the whole workflow as ONE node — name and description — instead of its
   * step spine. For overview rows, where a long flow would drown the picture;
   * the steps are one click away in the flow editor.
   */
  collapsed?: boolean;
  /** Static, tighter rendering for an expanded list row. */
  compact?: boolean;
  /**
   * Hide the "Workflow <name>" caption row — for hosts where the canvas sits
   * inside the workflow's own card and naming it again is noise.
   */
  hideActionLink?: boolean;
  locale?: string;
  /**
   * Where clicking into the workflow goes. The Space agent desk opens the
   * canvas IN PLACE — a routine lives in its Space, and editing its workflow
   * must not eject the user into the /admin/engenty debugging area.
   */
  onOpenAction: (workflowId: string) => void;
  /** Clicking the outcome node opens the destinations dialog. */
  onOpenOutcomes?: () => void;
  /** Clicking the wake-source node opens the triggers dialog. */
  onOpenTriggers?: () => void;
  /** Omit to draw a bare workflow: steps only, no wake source, no outcome. */
  routine?: RoutineDto | null;
  /** The workflow to draw when no routine names one. */
  workflowId?: string;
}

const EDGE_STYLE = { stroke: "var(--border)", strokeWidth: 1.5 };

export function RoutineCanvas({
  className,
  collapsed = false,
  compact = false,
  hideActionLink = false,
  locale = "en",
  onOpenAction,
  onOpenOutcomes,
  onOpenTriggers,
  routine,
  workflowId: boundWorkflowId,
}: RoutineCanvasProps) {
  const workflowId = routine?.workflow_id ?? boundWorkflowId ?? "";
  const detail = useWorkflowQuery(workflowId);

  // The version the routine actually runs: the graph's current one. A draft
  // saved after publish is NOT what fires tonight — the dispatcher re-reads
  // `current_version` at fire time.
  const graph = useMemo<StoredGraph | null>(() => {
    const row = detail.data?.graph;
    const versions = detail.data?.versions ?? [];
    const version =
      versions.find((entry) => entry.version === row?.current_version) ??
      versions[0];
    return version?.graph ?? null;
  }, [detail.data]);

  const row = detail.data?.graph;
  const shape = useMemo(() => {
    const full = buildRoutineShape({
      graph,
      locale,
      routine,
      workflowId,
    });
    if (!collapsed || full.middle.pending) {
      return full;
    }
    // The whole workflow as one node. Same three-band picture, the middle just
    // stops being a stack — the steps live in the workflow editor.
    return {
      ...full,
      middle: {
        ...full.middle,
        steps: [
          {
            chip: "Workflow",
            id: workflowId || "step",
            kind: "subaction" as const,
            subtitle: row?.description ?? null,
            title: row?.title ?? row?.name ?? "Workflow",
          },
        ],
      },
    };
  }, [workflowId, collapsed, graph, locale, routine, row]);

  const model = useMemo(
    () => routineShapeToCanvas(shape, { locale }),
    [locale, shape]
  );

  const edges = useMemo<Edge[]>(
    () =>
      model.edges.map((edge) => ({
        ...edge,
        style: EDGE_STYLE,
        type: "smoothstep",
      })),
    [model.edges]
  );

  if (shape.middle.pending) {
    return (
      <div className={cn("space-y-2", className)}>
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  const actionName = detail.data?.graph?.name ?? null;
  const actionVersion = detail.data?.graph?.current_version ?? null;

  // Canvas containers need a real height. Content height + padding, clamped:
  // a one-step routine stays a slim band, a long flow stops growing and pans.
  const height = Math.min(
    compact ? 320 : 560,
    Math.max(180, model.height + 64)
  );

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {shape.middle.workflowId && !hideActionLink ? (
        <div className="flex items-center gap-2 px-0.5">
          <span className="font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
            Workflow
          </span>
          <button
            className="truncate text-primary text-xs hover:underline"
            onClick={() => onOpenAction(shape.middle.workflowId)}
            type="button"
          >
            {actionName ?? shape.middle.workflowId}
            {actionVersion ? ` · v${actionVersion}` : ""}
          </button>
        </div>
      ) : null}
      <div
        className={cn(
          "engenty-workflow-canvas w-full",
          onOpenTriggers && "engenty-workflow-canvas--triggers-clickable",
          onOpenOutcomes && "engenty-workflow-canvas--outcomes-clickable"
        )}
        style={{ height }}
      >
        <ReactFlowProvider>
          <ReactFlow
            edges={edges}
            elementsSelectable={false}
            fitView
            fitViewOptions={{ maxZoom: 1, padding: compact ? 0.1 : 0.15 }}
            nodes={model.nodes as unknown as Node[]}
            nodesConnectable={false}
            nodesDraggable={false}
            nodeTypes={routineNodeTypes}
            onNodeClick={(_event, node) => {
              // A step opens the Action's canvas, the wake source opens the
              // triggers dialog, a delivery opens the deliveries — each band
              // is its own click target. The host decides WHERE things open.
              if (node.type === "trigger") {
                onOpenTriggers?.();
                return;
              }
              if (node.type === "delivery") {
                onOpenOutcomes?.();
                return;
              }
              if (node.type === "step" && workflowId) {
                onOpenAction(workflowId);
              }
            }}
            panOnDrag={!compact}
            panOnScroll={false}
            preventScrolling={!compact}
            proOptions={{ hideAttribution: true }}
            zoomOnDoubleClick={!compact}
            zoomOnPinch={!compact}
            zoomOnScroll={!compact}
          >
            <Background
              className="opacity-60"
              gap={18}
              size={1}
              variant={BackgroundVariant.Dots}
            />
            {compact ? null : <Controls showInteractive={false} />}
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </div>
  );
}
