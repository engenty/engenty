import { useQuery } from "@engenty/query-client";
import type { Edge, Node } from "@xyflow/react";
import MultiGraph from "graphology";
import circular from "graphology-layout/circular";
import forceAtlas2 from "graphology-layout-forceatlas2";
import { useMemo } from "react";
import { getEdges, getEntities, getOntology } from "../api.js";

const TYPE_PALETTE = [
  "#6366f1",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#ec4899",
  "#8b5cf6",
  "#ef4444",
  "#14b8a6",
  "#f97316",
  "#0ea5e9",
];

function typeColor(type: string, typeIndex: Map<string, number>): string {
  const idx = typeIndex.get(type) ?? 0;
  return TYPE_PALETTE[idx % TYPE_PALETTE.length];
}

export interface GraphFilter {
  search: string;
  typeFilter: string;
}

export interface EntityNodeData extends Record<string, unknown> {
  color: string;
  entityType: string;
  label: string;
}

export interface CgEdgeData extends Record<string, unknown> {
  edgeId: string;
}

export interface CgGraphDataResult {
  edges: Edge<CgEdgeData>[];
  error: Error | null;
  filteredNodeCount: number;
  isLoading: boolean;
  isRefetching: boolean;
  nodes: Node<EntityNodeData>[];
  refetch: () => void;
}

const LAYOUT_SCALE = 150;

export function useCgOntologyQuery() {
  return useQuery({
    queryKey: ["context-graph", "ontology"],
    queryFn: ({ signal }) => getOntology(signal),
    staleTime: 60_000,
  });
}

export function useCgGraphData(filter: GraphFilter): CgGraphDataResult {
  const entitiesQuery = useQuery({
    queryKey: ["context-graph", "entities", filter.typeFilter],
    queryFn: ({ signal }) =>
      getEntities(filter.typeFilter ? { type: filter.typeFilter } : {}, signal),
    staleTime: 30_000,
  });

  const edgesQuery = useQuery({
    queryKey: ["context-graph", "edges"],
    queryFn: ({ signal }) => getEdges(signal),
    staleTime: 30_000,
    enabled: !!entitiesQuery.data,
  });

  const { nodes, edges, filteredNodeCount } = useMemo(() => {
    const entityRows = entitiesQuery.data ?? [];
    const edgeRows = edgesQuery.data ?? [];

    const searchLower = filter.search.trim().toLowerCase();
    const visible = searchLower
      ? entityRows.filter((e) => {
          const label = e.name ?? e.type;
          return label.toLowerCase().includes(searchLower);
        })
      : entityRows;

    if (visible.length === 0) {
      return {
        nodes: [] as Node<EntityNodeData>[],
        edges: [] as Edge<CgEdgeData>[],
        filteredNodeCount: 0,
      };
    }

    const uniqueTypes = [...new Set(visible.map((e) => e.type))].sort();
    const typeIndex = new Map(uniqueTypes.map((t, i) => [t, i]));
    const visibleIds = new Set(visible.map((e) => e.id));

    const g = new MultiGraph();
    for (const entity of visible) {
      g.addNode(entity.id, {
        label:
          entity.name ?? entity.type.split(".").pop() ?? entity.id.slice(0, 8),
        entityType: entity.type,
        color: typeColor(entity.type, typeIndex),
        x: Math.random(),
        y: Math.random(),
      });
    }

    for (const edgeRow of edgeRows) {
      if (
        visibleIds.has(edgeRow.subject_id) &&
        visibleIds.has(edgeRow.object_id)
      ) {
        try {
          g.addEdge(edgeRow.subject_id, edgeRow.object_id, {});
        } catch {
          /* duplicate or invalid extremities */
        }
      }
    }

    circular.assign(g);
    const iterations = Math.min(600, Math.max(300, g.order * 4));
    forceAtlas2.assign(g, {
      iterations,
      settings: {
        gravity: 2,
        scalingRatio: 4,
        adjustSizes: true,
        strongGravityMode: true,
        barnesHutOptimize: g.order > 100,
      },
    });

    const rfNodes: Node<EntityNodeData>[] = g.nodes().map((nodeId) => {
      const attrs = g.getNodeAttributes(nodeId);
      return {
        id: nodeId,
        type: "entity" as const,
        position: {
          x: (attrs.x as number) * LAYOUT_SCALE,
          y: (attrs.y as number) * LAYOUT_SCALE,
        },
        data: {
          label: attrs.label as string,
          entityType: attrs.entityType as string,
          color: attrs.color as string,
        },
      };
    });

    const seenIds = new Set<string>();
    const rfEdges: Edge<CgEdgeData>[] = [];
    for (const edgeRow of edgeRows) {
      if (
        !(
          visibleIds.has(edgeRow.subject_id) &&
          visibleIds.has(edgeRow.object_id)
        ) ||
        seenIds.has(edgeRow.id)
      ) {
        continue;
      }
      seenIds.add(edgeRow.id);
      rfEdges.push({
        id: edgeRow.id,
        source: edgeRow.subject_id,
        target: edgeRow.object_id,
        label: edgeRow.type.split(".").pop() ?? edgeRow.type,
        data: { edgeId: edgeRow.id },
        type: "smoothstep",
      });
    }

    return {
      nodes: rfNodes,
      edges: rfEdges,
      filteredNodeCount: visible.length,
    };
  }, [entitiesQuery.data, edgesQuery.data, filter.search, filter.typeFilter]);

  return {
    filteredNodeCount,
    nodes,
    edges,
    isLoading: entitiesQuery.isLoading,
    isRefetching:
      (entitiesQuery.isFetching || edgesQuery.isFetching) &&
      !entitiesQuery.isLoading,
    error: (entitiesQuery.error ?? edgesQuery.error ?? null) as Error | null,
    refetch: () => {
      void entitiesQuery.refetch();
      void edgesQuery.refetch();
    },
  };
}
