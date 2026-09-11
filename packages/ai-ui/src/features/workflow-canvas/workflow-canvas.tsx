// One canvas, three modes.
//
// The definition IS the run view — that's the payoff of graph-as-data, and the
// reason this is one component with a `mode` rather than three screens. A user
// approves a picture, then watches that same picture fill in.
//
//   author  — problems on nodes, click to inspect
//   monitor — run state overlaid on the same shapes
//   approve — the pending gate highlighted, path so far tinted
import { cn } from "@engenty/ui-core";
import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  MiniMap,
  type Node,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
// Must come after the library sheet: it overrides the hard-coded light chrome.
import "./workflow-canvas.css";
import { useEffect, useMemo } from "react";
import {
  type CanvasNode,
  estimateNodeHeight,
  layoutCanvas,
  type StoredGraph,
  storedGraphToCanvas,
} from "./graph-model.js";
import type { GraphIssueDto } from "./workflow-api.js";
import {
  type NodeRunState,
  type WorkflowStepNodeProblem,
  workflowNodeTypes,
} from "./workflow-node.js";

export type CanvasMode = "author" | "monitor" | "approve";

export interface WorkflowCanvasProps {
  className?: string;
  graph: StoredGraph;
  /** Validation issues, keyed onto nodes by the entry ids they own. */
  issues?: GraphIssueDto[];
  mode: CanvasMode;
  onSelectNode?: (nodeId: string | null) => void;
  /** Per-entry run state (monitor / approve). */
  runState?: Record<string, { detail?: string; state: NodeRunState }>;
  selectedNodeId?: string | null;
  /** Draw the graph's input/output schemas as contract nodes. */
  showContract?: boolean;
}

/** Issue codes that are advisory rather than blocking. */
const WARNING_CODES = new Set(["capability-missing"]);

// Stable defaults. Inline `= []` / `= {}` defaults allocate a fresh object on
// every render, which changes the memo deps below, which re-runs the layout
// effects, which sets state, which re-renders — an infinite loop that only
// shows up when a caller omits the optional prop.
const NO_ISSUES: GraphIssueDto[] = [];
const NO_RUN_STATE: Record<string, { detail?: string; state: NodeRunState }> =
  {};

function problemsForNode(
  entryIds: string[],
  issues: GraphIssueDto[]
): WorkflowStepNodeProblem[] {
  return issues
    .filter((issue) => issue.entryId && entryIds.includes(issue.entryId))
    .map((issue) => ({
      code: issue.code,
      message: issue.message,
      severity: WARNING_CODES.has(issue.code)
        ? ("warning" as const)
        : ("error" as const),
    }));
}

function WorkflowCanvasInner({
  className,
  graph,
  issues = NO_ISSUES,
  mode,
  onSelectNode,
  runState = NO_RUN_STATE,
  selectedNodeId,
  showContract = false,
}: WorkflowCanvasProps) {
  const model = useMemo(
    () => storedGraphToCanvas(graph, { contract: showContract }),
    [graph, showContract]
  );

  const decorated = useMemo<Node[]>(() => {
    const withData = model.nodes.map((node) => {
      const entryIds = node.data.entryIds;
      const run = entryIds
        .map((entryId) => runState[entryId])
        .find((value) => Boolean(value));
      return {
        ...node,
        data: {
          ...node.data,
          problems: mode === "author" ? problemsForNode(entryIds, issues) : [],
          ...(run?.detail ? { runDetail: run.detail } : {}),
          ...(run ? { runState: run.state } : {}),
        },
        selected: node.id === selectedNodeId,
      };
    });
    // Re-layout AFTER decoration: problem badges and run detail change a node's
    // height, and laying out before they're known makes tall nodes overlap.
    return layoutCanvas(withData as never, (node: CanvasNode) =>
      estimateNodeHeight(node.data as never)
    ) as unknown as Node[];
  }, [issues, mode, model.nodes, runState, selectedNodeId]);

  const decoratedEdges = useMemo<Edge[]>(
    () =>
      model.edges.map((edge) => {
        const sourceRun = model.nodes
          .find((node) => node.id === edge.source)
          ?.data.entryIds.map((entryId) => runState[entryId])
          .find(Boolean);
        const active = sourceRun?.state === "running";
        const traversed =
          sourceRun?.state === "done" || sourceRun?.state === "skipped";
        const isBack = edge.variant === "back";
        return {
          ...edge,
          animated: active,
          // Fork and join edges leave and enter at an angle; a stepped path
          // makes the split legible where a straight line would just look like
          // a diagonal. The loop's return edge is dashed so it reads as "goes
          // back" rather than as another step forward.
          type: "smoothstep",
          ...(isBack
            ? {
                // Out the right side and back up — see the note on the side
                // handles in action-node.tsx.
                sourceHandle: "loop-out",
                style: {
                  stroke: "var(--muted-foreground)",
                  strokeDasharray: "4 4",
                  strokeWidth: 1.5,
                },
                targetHandle: "loop-in",
              }
            : {
                style: {
                  stroke: traversed
                    ? "var(--muted-foreground)"
                    : "var(--border)",
                  strokeWidth: active ? 2 : 1.5,
                },
              }),
          ...(edge.label
            ? {
                labelBgBorderRadius: 4,
                labelBgPadding: [6, 3] as [number, number],
                labelBgStyle: { fill: "var(--background)" },
                labelStyle: {
                  fill: "var(--muted-foreground)",
                  fontSize: 11,
                  fontWeight: 500,
                },
              }
            : {}),
        } as Edge;
      }),
    [model.edges, model.nodes, runState]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(decorated);
  const [edges, setEdges, onEdgesChange] = useEdgesState(decoratedEdges);
  const initialized = useNodesInitialized();
  const { fitView } = useReactFlow();

  // Layout is derived, so a graph or state change replaces the model wholesale
  // rather than trying to reconcile positions the user never chose.
  useEffect(() => {
    setNodes(decorated);
  }, [decorated, setNodes]);
  useEffect(() => {
    setEdges(decoratedEdges);
  }, [decoratedEdges, setEdges]);

  // Second pass, once React Flow has measured the DOM: re-run the SAME layout
  // with real heights. A node's height depends on how its subtitle and problem
  // messages wrap, which no pre-render estimate can know — and guessing short
  // makes tall nodes overlap the ones beneath them. Reusing `layoutCanvas`
  // rather than re-stacking by hand is what keeps forks intact: the branch row
  // is positioned by the same rules either way, just with better numbers.
  useEffect(() => {
    if (!initialized) {
      return;
    }
    setNodes((current) => {
      const next = layoutCanvas(
        current as never,
        (node: CanvasNode) =>
          (node as { measured?: { height?: number } }).measured?.height ??
          estimateNodeHeight(node.data as never)
      ) as unknown as Node[];
      const moved = next.some((node, index) => {
        const before = current[index];
        return (
          before?.position.x !== node.position.x ||
          before?.position.y !== node.position.y
        );
      });
      return moved ? next : current;
    });
  }, [initialized, decorated, setNodes]);

  // Re-fit after the measured pass so the whole flow is in frame.
  useEffect(() => {
    if (initialized) {
      window.requestAnimationFrame(() =>
        fitView({ duration: 200, maxZoom: 1, padding: 0.2 })
      );
    }
  }, [initialized, fitView, graph]);

  return (
    <div className={cn("engenty-workflow-canvas h-full w-full", className)}>
      <ReactFlow
        edges={edges}
        fitView
        fitViewOptions={{ maxZoom: 1, padding: 0.25 }}
        nodes={nodes}
        // Author mode allows rearranging for legibility; the run views are
        // read-only because a run is a fact, not a draft.
        nodesConnectable={false}
        nodesDraggable={mode === "author"}
        nodeTypes={workflowNodeTypes}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_event, node) => onSelectNode?.(node.id)}
        onNodesChange={onNodesChange}
        onPaneClick={() => onSelectNode?.(null)}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          className="opacity-60"
          gap={18}
          size={1}
          variant={BackgroundVariant.Dots}
        />
        {/* Chrome is themed in action-canvas.css — see the note there on why
            utilities can't win against the library's own stylesheet. */}
        <Controls showInteractive={false} />
        {nodes.length > 12 ? (
          <MiniMap
            maskColor="color-mix(in oklch, var(--muted) 60%, transparent)"
            nodeColor="var(--muted-foreground)"
            pannable
          />
        ) : null}
        {nodes.length === 0 ? (
          <Panel position="top-center">
            <div className="rounded-lg border border-dashed bg-card/80 px-6 py-5 text-center backdrop-blur">
              <p className="font-medium text-sm">Nothing here yet</p>
              <p className="mt-1 text-muted-foreground text-xs">
                Describe what should happen — the assistant will draw it.
              </p>
            </div>
          </Panel>
        ) : null}
      </ReactFlow>
    </div>
  );
}

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
