import type { OrgNodeRow, OrgNodeTreeNode } from "../schema/taxonomies.js";

export function assertNoOrgCycle(
  nodes: Pick<OrgNodeRow, "id" | "reports_to_id">[],
  nodeId: string,
  nextReportsToId: string | null
): void {
  if (!nextReportsToId) {
    return;
  }
  if (nextReportsToId === nodeId) {
    throw new Error("Org node cannot report to itself");
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let current: string | null = nextReportsToId;
  const visited = new Set<string>();
  while (current) {
    if (current === nodeId) {
      throw new Error("Org cycle detected");
    }
    if (visited.has(current)) {
      break;
    }
    visited.add(current);
    current = byId.get(current)?.reports_to_id ?? null;
  }
}

export function resolveReportsToOrgNodeId(
  nodes: Pick<OrgNodeRow, "id" | "profile_id" | "node_kind">[],
  reference: string | null
): string | null {
  if (reference === null) {
    return null;
  }
  const humanNodes = nodes.filter((node) => node.node_kind === "human");
  const byOrgNodeId = humanNodes.find((node) => node.id === reference);
  if (byOrgNodeId) {
    return byOrgNodeId.id;
  }
  const byProfileId = humanNodes.find((node) => node.profile_id === reference);
  if (byProfileId) {
    return byProfileId.id;
  }
  throw new Error(
    "reports_to_id must be the manager's org node id or profile id"
  );
}

export function buildOrgTree(
  nodes: OrgNodeRow[],
  roleLabels: Map<string, string | null>
): OrgNodeTreeNode[] {
  const byParent = new Map<string | null, OrgNodeRow[]>();
  for (const node of nodes) {
    const key = node.reports_to_id;
    const list = byParent.get(key) ?? [];
    list.push(node);
    byParent.set(key, list);
  }

  const build = (parentId: string | null): OrgNodeTreeNode[] => {
    const children = byParent.get(parentId) ?? [];
    return children
      .sort(
        (a, b) =>
          a.sort_order - b.sort_order ||
          a.display_name.localeCompare(b.display_name)
      )
      .map((n) => ({
        id: n.id,
        kind: n.node_kind,
        profile_id: n.profile_id,
        agent_id: n.agent_id,
        display_name: n.display_name,
        display_title: n.display_title,
        icon: n.icon,
        status: n.status,
        role_label:
          n.node_kind === "human" && n.profile_id
            ? (roleLabels.get(n.profile_id) ?? null)
            : null,
        reports: build(n.id),
      }));
  };

  return build(null);
}

export function buildChainOfCommand(
  nodes: OrgNodeRow[],
  startNodeId: string
): OrgNodeRow[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const chain: OrgNodeRow[] = [];
  let current = byId.get(startNodeId)?.reports_to_id ?? null;
  const visited = new Set<string>();
  while (current && !visited.has(current)) {
    visited.add(current);
    const node = byId.get(current);
    if (!node) {
      break;
    }
    chain.push(node);
    current = node.reports_to_id;
  }
  return chain;
}
