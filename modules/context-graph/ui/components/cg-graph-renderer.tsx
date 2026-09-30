import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  MarkerType,
  type Node,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import { useEffect, useRef } from "react";
import { CgEntityNode } from "./cg-entity-node.js";
import type { CgEdgeData, EntityNodeData } from "./use-cg-graph-data.js";

const nodeTypes = { entity: CgEntityNode };

interface Props {
  cameraResetNonce: number;
  edges: Edge<CgEdgeData>[];
  highlightEdgeIds?: Set<string> | null;
  highlightNodeIds?: Set<string> | null;
  nodes: Node<EntityNodeData>[];
  onSelectNode: (nodeId: string | null) => void;
  selectedNodeId: string | null;
}

function CgGraphRendererInner({
  cameraResetNonce,
  edges: baseEdges,
  highlightEdgeIds,
  highlightNodeIds,
  nodes: baseNodes,
  onSelectNode,
  selectedNodeId,
}: Props) {
  const { fitView } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<EntityNodeData>>(
    []
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<CgEdgeData>>([]);

  const selectedNodeIdRef = useRef(selectedNodeId);
  selectedNodeIdRef.current = selectedNodeId;
  const highlightNodeIdsRef = useRef(highlightNodeIds);
  highlightNodeIdsRef.current = highlightNodeIds;

  // Full reset (positions too) when base data changes
  useEffect(() => {
    setNodes(
      baseNodes.map((n) => ({
        ...n,
        selected: n.id === selectedNodeIdRef.current,
        data: {
          ...n.data,
          isSelected: n.id === selectedNodeIdRef.current,
          isHighlighted: highlightNodeIdsRef.current
            ? highlightNodeIdsRef.current.has(n.id)
            : null,
        },
      }))
    );
  }, [baseNodes, setNodes]);

  // Data-only update when selection / highlight changes (preserves drag positions)
  useEffect(() => {
    setNodes((prev) =>
      prev.map((n) => ({
        ...n,
        selected: n.id === selectedNodeId,
        data: {
          ...n.data,
          isSelected: n.id === selectedNodeId,
          isHighlighted: highlightNodeIds ? highlightNodeIds.has(n.id) : null,
        },
      }))
    );
  }, [selectedNodeId, highlightNodeIds, setNodes]);

  // Edge styling (no positional state, always safe to recompute)
  useEffect(() => {
    setEdges(
      baseEdges.map((e) => {
        const isHighlighted =
          highlightEdgeIds?.has(e.data?.edgeId as string) ?? false;
        const hlActive = highlightNodeIds != null;
        const isAdjacentToSelected =
          selectedNodeId !== null &&
          (e.source === selectedNodeId || e.target === selectedNodeId);

        const stroke = isHighlighted
          ? "#6366f1"
          : hlActive
            ? "#e2e8f0"
            : "#94a3b8";

        return {
          ...e,
          label: isAdjacentToSelected ? e.label : undefined,
          animated: isHighlighted,
          style: {
            stroke,
            strokeWidth: isHighlighted ? 2.5 : 1,
            opacity: hlActive && !isHighlighted ? 0.3 : 1,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: stroke,
          },
          labelStyle: { fontSize: "10px", fill: "#475569" },
          labelBgStyle: { fill: "white", opacity: 0.8 },
          labelBgPadding: [4, 2] as [number, number],
          labelBgBorderRadius: 3,
        };
      })
    );
  }, [baseEdges, selectedNodeId, highlightEdgeIds, highlightNodeIds, setEdges]);

  // Camera reset
  useEffect(() => {
    if (cameraResetNonce === 0) {
      return;
    }
    void fitView({ duration: 220 });
  }, [cameraResetNonce, fitView]);

  return (
    <ReactFlow
      className="bg-background"
      edges={edges}
      fitView
      maxZoom={4}
      minZoom={0.05}
      nodes={nodes}
      nodeTypes={nodeTypes}
      onEdgesChange={onEdgesChange}
      onNodeClick={(_, node) => {
        onSelectNode(selectedNodeId === node.id ? null : node.id);
      }}
      onNodesChange={onNodesChange}
      onPaneClick={() => onSelectNode(null)}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={20} size={1} variant={BackgroundVariant.Dots} />
      <Controls />
    </ReactFlow>
  );
}

export function CgGraphRenderer(props: Props) {
  return (
    <ReactFlowProvider>
      <CgGraphRendererInner {...props} />
    </ReactFlowProvider>
  );
}
