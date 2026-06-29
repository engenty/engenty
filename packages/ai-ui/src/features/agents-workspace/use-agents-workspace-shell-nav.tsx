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
  AiRegisteredAction,
  AiSkillRecord,
} from "../../lib/admin/ai-runtime-api";
import { AgentsWorkspaceSidebar } from "./agents-workspace-sidebar";
import { AgentsWorkspaceSidebarHeader } from "./agents-workspace-sidebar-header";

export interface UseAgentsWorkspaceShellNavOptions {
  actions: AiRegisteredAction[];
  actionsLoading: boolean;
  agents: AiAgentEntry[];
  isLandingPage?: boolean;
  onNavigate?: () => void;
  onSelectAction: (id: string) => void;
  onSelectAgent: (id: string) => void;
  onSelectSkill: (name: string) => void;
  selectedActionId?: string;
  selectedAgentId: string;
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
    actions,
    actionsLoading,
    agents,
    isLandingPage = false,
    onNavigate,
    onSelectAction,
    onSelectAgent,
    onSelectSkill,
    selectedActionId = "",
    selectedAgentId,
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
        actions={actions}
        actionsLoading={actionsLoading}
        agents={agents}
        isLandingPage={isLandingPage}
        onNavigate={onNavigate}
        onSelectAction={onSelectAction}
        onSelectAgent={onSelectAgent}
        onSelectSkill={onSelectSkill}
        selectedActionId={selectedActionId}
        selectedAgentId={selectedAgentId}
        selectedSkillId={selectedSkillId}
        skills={skills}
        skillsLoading={skillsLoading}
      />
    ),
    [
      actions,
      actionsLoading,
      agents,
      isLandingPage,
      onNavigate,
      onSelectAction,
      onSelectAgent,
      onSelectSkill,
      selectedActionId,
      selectedAgentId,
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
