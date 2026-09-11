/**
 * Shell nav hook for admin/engenty workspace pages.
 * Registers the AgentsWorkspaceSidebar into the app shell's secondary column
 * (secondaryNavAfterItems) and the header slot (secondaryNavHeaderSlot),
 * exactly like useKbModuleSecondaryShellNav does for Knowledge Base.
 *
 * Usage: call at the top of every admin/engenty page instead of AgentsWorkspaceShell.
 */

import { type ReactNode, useMemo } from "react";
import type {
  AiAgentEntry,
  AiSkillRecord,
} from "../../lib/admin/ai-runtime-api";
import type { WorkflowCatalogEntry } from "../workflow-canvas/workflow-flows-state.js";
import { AgentsWorkspaceSidebar } from "./agents-workspace-sidebar";
import { AgentsWorkspaceSidebarHeader } from "./agents-workspace-sidebar-header";

export interface UseAgentsWorkspaceShellNavOptions {
  agents: AiAgentEntry[];
  flows: WorkflowCatalogEntry[];
  flowsLoading: boolean;
  isLandingPage?: boolean;
  onNavigate?: () => void;
  onSelectAgent: (id: string) => void;
  onSelectFlow: (flow: WorkflowCatalogEntry) => void;
  onSelectSkill: (name: string) => void;
  selectedAgentId: string;
  selectedFlowId?: string;
  selectedSkillId?: string;
  skills: AiSkillRecord[];
  skillsLoading: boolean;
}

export interface UseAgentsWorkspaceShellNavResult {
  secondaryNavAfterItems: ReactNode;
  secondaryNavHeaderSlot: ReactNode;
}

export function useAgentsWorkspaceShellNav(
  options: UseAgentsWorkspaceShellNavOptions
): UseAgentsWorkspaceShellNavResult {
  const {
    agents,
    flows,
    flowsLoading,
    isLandingPage = false,
    onNavigate,
    onSelectAgent,
    onSelectFlow,
    onSelectSkill,
    selectedAgentId,
    selectedFlowId = "",
    selectedSkillId = "",
    skills,
    skillsLoading,
  } = options;

  const secondaryNavHeaderSlot = useMemo(
    () => <AgentsWorkspaceSidebarHeader />,
    []
  );

  const secondaryNavAfterItems = useMemo(
    () => (
      <AgentsWorkspaceSidebar
        agents={agents}
        flows={flows}
        flowsLoading={flowsLoading}
        isLandingPage={isLandingPage}
        onNavigate={onNavigate}
        onSelectAgent={onSelectAgent}
        onSelectFlow={onSelectFlow}
        onSelectSkill={onSelectSkill}
        selectedAgentId={selectedAgentId}
        selectedFlowId={selectedFlowId}
        selectedSkillId={selectedSkillId}
        skills={skills}
        skillsLoading={skillsLoading}
      />
    ),
    [
      agents,
      flows,
      flowsLoading,
      isLandingPage,
      onNavigate,
      onSelectAgent,
      onSelectFlow,
      onSelectSkill,
      selectedAgentId,
      selectedFlowId,
      selectedSkillId,
      skills,
      skillsLoading,
    ]
  );

  return {
    secondaryNavAfterItems,
    secondaryNavHeaderSlot,
  };
}
