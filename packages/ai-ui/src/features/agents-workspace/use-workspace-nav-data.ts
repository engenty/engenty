// Shared nav data for useAgentsWorkspaceShellNav across all admin/engenty pages.
// Fetches agents, actions, skills once per page tree (TanStack dedupes across calls).

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  useAiActionsQuery,
  useAiAgentsQuery,
  useAiSkillsQuery,
} from "../../lib/admin/ai-runtime-queries";
import { useAiInstructionsCatalogQuery } from "../../lib/admin/instruction-settings-queries";
import {
  buildAgentCatalogEntries,
  compareCoreModuleThenModuleName,
} from "../ai-settings/agent-catalog";
import {
  buildActionDetailPath,
  buildAgentDetailPath,
  buildSkillDetailPath,
} from "./agent-workspace-url-state";
import type { UseAgentsWorkspaceShellNavOptions } from "./use-agents-workspace-shell-nav";

type WorkspaceNavData = Omit<
  UseAgentsWorkspaceShellNavOptions,
  | "isLandingPage"
  | "onNavigate"
  | "selectedActionId"
  | "selectedAgentId"
  | "selectedSkillId"
>;

export function useWorkspaceNavData(): WorkspaceNavData {
  const navigate = useNavigate();
  const agentsQuery = useAiAgentsQuery();
  const actionsQuery = useAiActionsQuery();
  const skillsQuery = useAiSkillsQuery();
  const instructionsCatalogQuery = useAiInstructionsCatalogQuery();

  const agents = useMemo(
    () =>
      buildAgentCatalogEntries({
        agents: agentsQuery.data?.agents ?? [],
        documents: instructionsCatalogQuery.data?.documents ?? [],
      }).toSorted(compareCoreModuleThenModuleName),
    [agentsQuery.data?.agents, instructionsCatalogQuery.data?.documents]
  );

  const actions = useMemo(
    () =>
      (actionsQuery.data?.actions ?? []).toSorted(
        compareCoreModuleThenModuleName
      ),
    [actionsQuery.data?.actions]
  );

  const skills = useMemo(
    () =>
      (skillsQuery.data?.skills ?? []).toSorted((l, r) =>
        l.name.localeCompare(r.name)
      ),
    [skillsQuery.data?.skills]
  );

  return {
    actions,
    actionsLoading: actionsQuery.isLoading,
    agents,
    onSelectAction: (id: string) =>
      navigate(buildActionDetailPath(id, { file: "ACTION.md" }), {
        replace: true,
      }),
    onSelectAgent: (id: string) =>
      navigate(buildAgentDetailPath(id), { replace: true }),
    onSelectSkill: (name: string) =>
      navigate(buildSkillDetailPath(name, { file: "SKILL.md" })),
    skills,
    skillsLoading: skillsQuery.isLoading,
  };
}
