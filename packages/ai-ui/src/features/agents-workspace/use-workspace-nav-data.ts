// Shared nav data for useAgentsWorkspaceShellNav across all admin/engenty pages.
// Fetches agents, flows and skills once per page tree (TanStack dedupes across
// calls).

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  useAiAgentsQuery,
  useAiSkillsQuery,
} from "../../lib/admin/ai-runtime-queries";
import { useAiInstructionsCatalogQuery } from "../../lib/admin/instruction-settings-queries";
import {
  buildAgentCatalogEntries,
  compareCoreModuleThenModuleName,
} from "../ai-settings/agent-catalog";
import {
  buildAgentDetailPath,
  buildSkillDetailPath,
} from "./agent-workspace-url-state";
import type { UseAgentsWorkspaceShellNavOptions } from "./use-agents-workspace-shell-nav";
import { useFlowCatalog, useSelectFlow } from "./use-flow-catalog";

type WorkspaceNavData = Omit<
  UseAgentsWorkspaceShellNavOptions,
  | "isLandingPage"
  | "onNavigate"
  | "selectedAgentId"
  | "selectedFlowId"
  | "selectedSkillId"
>;

export function useWorkspaceNavData(): WorkspaceNavData {
  const navigate = useNavigate();
  const agentsQuery = useAiAgentsQuery();
  const skillsQuery = useAiSkillsQuery();
  const { flows, flowsLoading } = useFlowCatalog();
  const onSelectFlow = useSelectFlow();
  const instructionsCatalogQuery = useAiInstructionsCatalogQuery();

  const agents = useMemo(
    () =>
      buildAgentCatalogEntries({
        agents: agentsQuery.data?.agents ?? [],
        documents: instructionsCatalogQuery.data?.documents ?? [],
      }).toSorted(compareCoreModuleThenModuleName),
    [agentsQuery.data?.agents, instructionsCatalogQuery.data?.documents]
  );

  const skills = useMemo(
    () =>
      (skillsQuery.data?.skills ?? []).toSorted((l, r) =>
        l.name.localeCompare(r.name)
      ),
    [skillsQuery.data?.skills]
  );

  return {
    agents,
    flows,
    flowsLoading,
    onSelectFlow,
    onSelectAgent: (id: string) =>
      navigate(buildAgentDetailPath(id), { replace: true }),
    onSelectSkill: (name: string) =>
      navigate(buildSkillDetailPath(name, { file: "SKILL.md" })),
    skills,
    skillsLoading: skillsQuery.isLoading,
  };
}
