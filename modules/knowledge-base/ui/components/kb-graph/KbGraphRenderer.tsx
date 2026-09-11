/**
 * Sigma.js WebGL renderer for the KB knowledge graph.
 * Manages Sigma lifecycle tied to the Graphology graph instance.
 */

import type MultiGraph from "graphology";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Sigma from "sigma";
import { kbArticlePath } from "../../kb-paths.js";

interface NodeTooltip {
  label: string;
  x: number;
  y: number;
}

interface Props {
  cameraResetNonce: number;
  graph: MultiGraph;
}

export function KbGraphRenderer({ cameraResetNonce, graph }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const navigate = useNavigate();
  const [tooltip, setTooltip] = useState<NodeTooltip | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const selectedNodeRef = useRef<string | null>(null);
  selectedNodeRef.current = selectedNode;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || graph.order === 0) {
      return;
    }

    sigmaRef.current?.kill();

    const sigma = new Sigma(graph, container, {
      renderEdgeLabels: false,
      allowInvalidContainer: true,
      defaultEdgeType: "line",
      labelFont: "Inter, system-ui, sans-serif",
      labelSize: 11,
      labelWeight: "400",
      labelColor: { color: "#94a3b8" },
      minCameraRatio: 0.05,
      maxCameraRatio: 5,
      nodeReducer: (node, data) => {
        const sel = selectedNodeRef.current;
        const highlighted = sel !== null && node === sel;
        return {
          ...data,
          size: highlighted
            ? (data.size as number) * 1.6
            : (data.size as number),
          zIndex: highlighted ? 1 : 0,
          label: data.label as string,
        };
      },
      edgeReducer: (edge, data) => {
        const sel = selectedNodeRef.current;
        if (!sel) {
          return data;
        }
        const [src, tgt] = graph.extremities(edge);
        if (src === sel || tgt === sel) {
          return { ...data, color: "#6366f1", size: 2.5 };
        }
        return { ...data, color: "#475569", size: 1.2 };
      },
    });

    sigma.on("clickNode", ({ node, event }) => {
      event.preventSigmaDefault();
      setSelectedNode((prev) => (prev === node ? null : node));
    });

    sigma.on("doubleClickNode", ({ node, event }) => {
      event.preventSigmaDefault();
      const slug = graph.getNodeAttribute(node, "slug") as string;
      if (slug) {
        navigate(kbArticlePath(node));
      }
    });

    sigma.on("enterNode", ({ node }) => {
      const label = graph.getNodeAttribute(node, "label") as string;
      const { x, y } = sigma.graphToViewport({
        x: graph.getNodeAttribute(node, "x") as number,
        y: graph.getNodeAttribute(node, "y") as number,
      });
      setTooltip({ label, x, y });
      container.style.cursor = "pointer";
    });

    sigma.on("leaveNode", () => {
      setTooltip(null);
      container.style.cursor = "default";
    });

    sigma.on("clickStage", () => {
      setSelectedNode(null);
    });

    sigmaRef.current = sigma;

    return () => {
      sigma.kill();
      sigmaRef.current = null;
    };
  }, [graph, navigate]);

  // Re-render on selection change without full reinit
  useEffect(() => {
    sigmaRef.current?.refresh();
  }, [selectedNode]);

  useEffect(() => {
    if (cameraResetNonce === 0) {
      return;
    }
    const cam = sigmaRef.current?.getCamera();
    if (!cam) {
      return;
    }
    void cam.animatedReset({ duration: 220 });
  }, [cameraResetNonce]);

  return (
    <div className="relative h-full w-full">
      <div className="h-full w-full" ref={containerRef} />
      {tooltip ? (
        <div
          className="pointer-events-none absolute z-10 max-w-[200px] rounded-md border bg-popover px-2.5 py-1.5 text-popover-foreground text-xs shadow-md"
          style={{ left: tooltip.x + 12, top: tooltip.y - 12 }}
        >
          {tooltip.label}
        </div>
      ) : null}
    </div>
  );
}
