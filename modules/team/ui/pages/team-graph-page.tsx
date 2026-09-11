import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import {
  Background,
  Controls,
  type Edge,
  type Node,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useMemo, useState } from "react";
import type { TeamGroup, TeamOrgGraphFlatNode } from "../api.js";
import { TeamGroupNode } from "../components/graph/team-group-node.js";
import { TeamMemberNode } from "../components/graph/team-member-node.js";
import { useTeamGraphAgentUiSlice } from "../hooks/use-team-agent-ui-slice.js";
import { useTeamModuleSecondaryShellNav } from "../hooks/use-team-module-secondary-shell-nav.js";
import { getLayoutedElements } from "../lib/dagre-layout.js";
import { teamModulePageFillShellSectionClassName } from "../lib/team-page-shell.js";
import {
  teamGroupsQueryOptions,
  teamOrgGraphQueryOptions,
} from "../team-module-queries.js";

const nodeTypes = {
  groupNode: TeamGroupNode,
  memberNode: TeamMemberNode,
};

function TeamGraphCanvasInner() {
  const { data: members, isPending: isMembersPending } = useQuery(
    teamOrgGraphQueryOptions()
  );
  const { data: groups, isPending: isGroupsPending } = useQuery(
    teamGroupsQueryOptions()
  );

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set()
  );
  const [collapsedManagers, setCollapsedManagers] = useState<Set<string>>(
    new Set()
  );

  const toggleGroup = useCallback((groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  const toggleManager = useCallback((managerId: string) => {
    setCollapsedManagers((prev) => {
      const next = new Set(prev);
      if (next.has(managerId)) {
        next.delete(managerId);
      } else {
        next.add(managerId);
      }
      return next;
    });
  }, []);

  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(() => {
    if (!(members && groups)) {
      return { nodes: [], edges: [] };
    }

    const initialNodes: Node[] = [];
    const initialEdges: Edge[] = [];

    const groupsWithMembers = new Set<string>();
    const managerReportCounts = new Map<string, number>();

    members.forEach((m: TeamOrgGraphFlatNode) => {
      if (m.group_ids && m.group_ids.length > 0) {
        groupsWithMembers.add(m.group_ids[0]);
      } else {
        groupsWithMembers.add("unassigned");
      }
      if (m.reports_to_id) {
        managerReportCounts.set(
          m.reports_to_id,
          (managerReportCounts.get(m.reports_to_id) || 0) + 1
        );
      }
    });

    groups.forEach((g: TeamGroup) => {
      if (groupsWithMembers.has(g.id)) {
        initialNodes.push({
          id: g.id,
          type: "groupNode",
          position: { x: 0, y: 0 },
          data: {
            title: g.name,
            isCollapsed: collapsedGroups.has(g.id),
            onToggle: toggleGroup,
          },
        });
      }
    });

    if (groupsWithMembers.has("unassigned")) {
      initialNodes.push({
        id: "unassigned",
        type: "groupNode",
        position: { x: 0, y: 0 },
        data: {
          title: "Unassigned",
          isCollapsed: collapsedGroups.has("unassigned"),
          onToggle: toggleGroup,
        },
      });
    }

    members.forEach((m: TeamOrgGraphFlatNode) => {
      let parentId: string;
      if (m.reports_to_id) {
        parentId = m.reports_to_id;
      } else {
        parentId =
          m.group_ids && m.group_ids.length > 0 ? m.group_ids[0] : "unassigned";
      }

      const isManager = managerReportCounts.has(m.id);

      initialNodes.push({
        id: m.id,
        type: "memberNode",
        parentId,
        position: { x: 0, y: 0 },
        data: {
          fullName: m.display_name,
          initials: null,
          avatarStorageKey: m.profile_image_storage_key,
          role: m.role_term_label || m.role_label,
          isManager,
          reportCount: managerReportCounts.get(m.id) || 0,
          isCollapsed: collapsedManagers.has(m.id),
          onToggleManager: toggleManager,
        },
      });
    });

    const visibleNodes = initialNodes.filter((n) => {
      let current = n.parentId;
      while (current) {
        if (collapsedGroups.has(current) || collapsedManagers.has(current)) {
          return false;
        }
        const parentNode = initialNodes.find((p) => p.id === current);
        current = parentNode?.parentId;
      }
      return true;
    });

    const visibleEdges = initialEdges
      .map((e) => {
        let source = e.source;
        let target = e.target;

        const resolveVisibleParent = (nodeId: string) => {
          let curr = nodeId;
          let node = initialNodes.find((n) => n.id === curr);
          let lastVisible = curr;
          while (node?.parentId) {
            if (
              collapsedGroups.has(node.parentId) ||
              collapsedManagers.has(node.parentId)
            ) {
              lastVisible = node.parentId;
            }
            curr = node.parentId;
            node = initialNodes.find((n) => n.id === curr);
          }
          return lastVisible;
        };

        source = resolveVisibleParent(source);
        target = resolveVisibleParent(target);

        return { ...e, source, target, id: `edge-${source}-${target}` };
      })
      .filter((e) => e.source !== e.target);

    const edgeIds = new Set<string>();
    const uniqueEdges: Edge[] = [];
    for (const e of visibleEdges) {
      if (!edgeIds.has(e.id)) {
        edgeIds.add(e.id);
        uniqueEdges.push(e);
      }
    }

    return getLayoutedElements(visibleNodes, uniqueEdges);
  }, [
    members,
    groups,
    collapsedGroups,
    collapsedManagers,
    toggleGroup,
    toggleManager,
  ]);

  if (isMembersPending || isGroupsPending) {
    return (
      <div className="ui-card-elevated flex min-h-[420px] items-center justify-center">
        <span className="text-muted-foreground text-sm">Loading graph...</span>
      </div>
    );
  }

  return (
    <div className="ui-card-elevated min-h-0 min-h-[420px] w-full flex-1">
      <ReactFlow
        edges={layoutedEdges}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1, minZoom: 0.05 }}
        maxZoom={2}
        minZoom={0.05}
        nodes={layoutedNodes}
        nodeTypes={nodeTypes}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} />
        <Controls />
      </ReactFlow>
    </div>
  );
}

function TeamGraphCanvas() {
  return <TeamGraphCanvasInner />;
}

export function TeamGraphPage() {
  const { t } = useTranslation("team");
  const shellNav = useTeamModuleSecondaryShellNav();
  useTeamGraphAgentUiSlice();

  usePageConfig({
    breadcrumbs: [
      ...(shellNav.moduleRootCrumb ? [shellNav.moduleRootCrumb] : []),
      { label: t("sidebar.nav_graph") },
    ],
    secondaryNavAfterItems: shellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: shellNav.secondaryNavHeaderSlot,
  });

  return (
    <section className={teamModulePageFillShellSectionClassName}>
      <ReactFlowProvider>
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <TeamGraphCanvas />
        </div>
      </ReactFlowProvider>
    </section>
  );
}
