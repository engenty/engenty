import type { Edge, Node } from "@xyflow/react";
import dagre from "dagre";

export interface LayoutOptions {
  direction?: "TB" | "LR";
  nodeHeight?: number;
  nodeWidth?: number;
}

const INNER_PADDING = 16;
const INNER_GAP = 8;
const MANAGER_HEADER_HEIGHT = 44;
const MAX_COLUMNS = 4;

function computeManagerSize(
  managerId: string,
  nodes: Node[],
  nodeWidth: number,
  nodeHeight: number
): { width: number; height: number } {
  const reports = nodes.filter((n) => n.parentId === managerId);
  if (reports.length === 0) {
    return { width: nodeWidth, height: nodeHeight };
  }
  const cols = Math.min(reports.length, MAX_COLUMNS);
  const rows = Math.ceil(reports.length / MAX_COLUMNS);
  return {
    width: cols * nodeWidth + (cols - 1) * INNER_GAP + INNER_PADDING * 2,
    height:
      MANAGER_HEADER_HEIGHT +
      rows * nodeHeight +
      (rows - 1) * INNER_GAP +
      INNER_PADDING * 2,
  };
}

export function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {}
): { nodes: Node[]; edges: Edge[] } {
  const dagreGraph = new dagre.graphlib.Graph({ compound: true });
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  const direction = options.direction || "TB";

  dagreGraph.setGraph({
    rankdir: direction,
    ranksep: 80,
    nodesep: 40,
    edgesep: 20,
    marginx: 40,
    marginy: 40,
  });

  const NODE_WIDTH = options.nodeWidth || 220;
  const NODE_HEIGHT = options.nodeHeight || 64;

  const nodeIds = new Set(nodes.map((n) => n.id));
  const parentMap = new Map<string, string>();

  // Pre-compute manager sizes before any parentId mutations
  const managerSizes = new Map<string, { width: number; height: number }>();
  for (const node of nodes) {
    if (
      node.type === "memberNode" &&
      node.data?.isManager &&
      !node.data?.isCollapsed
    ) {
      managerSizes.set(
        node.id,
        computeManagerSize(node.id, nodes, NODE_WIDTH, NODE_HEIGHT)
      );
    }
  }

  const createsCycle = (nodeId: string, parentId: string) => {
    let current: string | undefined = parentId;
    while (current) {
      if (current === nodeId) {
        return true;
      }
      current = parentMap.get(current);
    }
    return false;
  };

  // Dagre only supports 2-level compound nesting reliably.
  // Resolve any member->member parent to the nearest groupNode ancestor.
  const resolveGroupParent = (parentId: string): string | undefined => {
    const p = nodes.find((n) => n.id === parentId);
    if (!p) {
      return;
    }
    if (p.type === "groupNode") {
      return parentId;
    }
    if (p.parentId && nodeIds.has(p.parentId)) {
      return resolveGroupParent(p.parentId);
    }
    return;
  };

  nodes.forEach((node) => {
    const isManagerGroup = node.type === "memberNode" && node.data?.isManager;
    const isExpandedManager = isManagerGroup && !node.data?.isCollapsed;

    if (node.type === "groupNode") {
      if (node.data?.isCollapsed) {
        dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
      } else {
        // Compound container sized to fit its direct member children
        dagreGraph.setNode(node.id, { label: node.id });
      }
    } else if (isExpandedManager) {
      // Pre-sized container — dagre treats it as a leaf, not a compound parent.
      // Reports are positioned with a fixed grid in the second pass below.
      const size = managerSizes.get(node.id) ?? {
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      };
      dagreGraph.setNode(node.id, size);
    } else {
      dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    }

    let safeParentId = node.parentId;
    if (safeParentId && nodeIds.has(safeParentId)) {
      if (createsCycle(node.id, safeParentId)) {
        // biome-ignore lint/suspicious/noConsole: Expected warning for infinite cycle detection
        console.warn(
          `Cycle detected: ${node.id} -> ${safeParentId}. Breaking cycle.`
        );
        safeParentId = undefined;
      } else {
        parentMap.set(node.id, safeParentId);
        // Only set a dagre compound parent when resolving up to a groupNode.
        // Skipping member->member setParent avoids 3-level compound crashes in dagre.
        const dagreParentId = resolveGroupParent(safeParentId);
        if (dagreParentId) {
          dagreGraph.setParent(node.id, dagreParentId);
        }
      }
    } else {
      safeParentId = undefined;
    }

    node.parentId = safeParentId;
  });

  edges.forEach((edge) => {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      dagreGraph.setEdge(edge.source, edge.target);
    }
  });

  // Grid-wrap only direct group children (manager children use the fixed grid below)
  const groupChildrenMap = new Map<string, string[]>();
  nodes.forEach((node) => {
    if (node.parentId) {
      const parentNode = nodes.find((n) => n.id === node.parentId);
      if (parentNode?.type === "groupNode") {
        if (!groupChildrenMap.has(node.parentId)) {
          groupChildrenMap.set(node.parentId, []);
        }
        groupChildrenMap.get(node.parentId)!.push(node.id);
      }
    }
  });

  for (const children of groupChildrenMap.values()) {
    if (children.length > MAX_COLUMNS) {
      for (let i = 0; i < children.length - MAX_COLUMNS; i++) {
        dagreGraph.setEdge(children[i], children[i + MAX_COLUMNS], {
          weight: 1,
          minlen: 1,
        });
      }
    }
  }

  dagre.layout(dagreGraph);

  const absolutePositions = new Map<string, { x: number; y: number }>();

  const newNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    const newNode = { ...node };

    const isExpandedGroup =
      node.type === "groupNode" && !node.data?.isCollapsed;
    const isExpandedManager =
      node.type === "memberNode" &&
      !!node.data?.isManager &&
      !node.data?.isCollapsed;

    if (isExpandedGroup) {
      const width = nodeWithPosition.width || NODE_WIDTH;
      const height = nodeWithPosition.height || NODE_HEIGHT;
      const absoluteX = nodeWithPosition.x - width / 2;
      const absoluteY = nodeWithPosition.y - height / 2;
      absolutePositions.set(node.id, { x: absoluteX, y: absoluteY });
      newNode.position = { x: absoluteX, y: absoluteY };
      newNode.style = { ...newNode.style, width, height: height + 20 };
    } else if (isExpandedManager) {
      const size = managerSizes.get(node.id) ?? {
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      };
      const w = nodeWithPosition.width || size.width;
      const h = nodeWithPosition.height || size.height;
      const absoluteX = nodeWithPosition.x - w / 2;
      const absoluteY = nodeWithPosition.y - h / 2;
      absolutePositions.set(node.id, { x: absoluteX, y: absoluteY });
      newNode.position = { x: absoluteX, y: absoluteY };
      newNode.style = {
        ...newNode.style,
        width: size.width,
        height: size.height,
      };
    } else {
      const absoluteX = nodeWithPosition.x - NODE_WIDTH / 2;
      const absoluteY = nodeWithPosition.y - NODE_HEIGHT / 2;
      absolutePositions.set(node.id, { x: absoluteX, y: absoluteY });
      newNode.position = { x: absoluteX, y: absoluteY };
    }

    return newNode;
  });

  // Adjust child positions to be relative to their React Flow parent
  newNodes.forEach((node) => {
    if (node.parentId) {
      const parentNode = nodes.find((n) => n.id === node.parentId);

      if (
        parentNode?.type === "memberNode" &&
        parentNode?.data?.isManager &&
        !parentNode?.data?.isCollapsed
      ) {
        // Fixed grid layout inside the manager card (independent of dagre positions)
        const siblings = nodes.filter((n) => n.parentId === node.parentId);
        const idx = siblings.findIndex((n) => n.id === node.id);
        const col = idx % MAX_COLUMNS;
        const row = Math.floor(idx / MAX_COLUMNS);
        node.position = {
          x: INNER_PADDING + col * (NODE_WIDTH + INNER_GAP),
          y:
            MANAGER_HEADER_HEIGHT +
            INNER_PADDING +
            row * (NODE_HEIGHT + INNER_GAP),
        };
      } else {
        const parentPos = absolutePositions.get(node.parentId);
        if (parentPos) {
          let yOffset = 0;
          if (parentNode?.type === "memberNode") {
            yOffset = 40;
          } else if (parentNode?.type === "groupNode") {
            yOffset = 20;
          }
          node.position = {
            x: node.position.x - parentPos.x,
            y: node.position.y - parentPos.y + yOffset,
          };
        }
      }
    }
  });

  return { nodes: newNodes, edges };
}
