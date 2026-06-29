import { useMemo } from "react";
import {
  useAiActionsQuery,
  useAiAgentsQuery,
  useAiSkillCatalogQuery,
  useAiSkillsQuery,
  useAiTriggersQuery,
} from "../../lib/admin/ai-runtime-queries";
import { toAiInstructionFileDocument } from "../../lib/admin/instruction-settings-api";
import { useAiInstructionsCatalogQuery } from "../../lib/admin/instruction-settings-queries";
import {
  buildAgentCatalogEntries,
  compareCoreModuleThenModuleName,
  filterAgentActions,
  filterAgentTriggers,
  isCoreAgentModuleId,
} from "../ai-settings/agent-catalog";
import { pickCatalogDocuments } from "../ai-settings/instruction-groups";
import { getSkillModuleId } from "./skill-record-utils";
import { useAgentsWorkspaceNavigation } from "./use-agents-workspace-navigation";

export function useAgentDetail() {
  const navigation = useAgentsWorkspaceNavigation();
  const catalogQuery = useAiInstructionsCatalogQuery();
  const agentsQuery = useAiAgentsQuery();
  const actionsQuery = useAiActionsQuery();
  const skillsAdminQuery = useAiSkillsQuery();
  const skillCatalogQuery = useAiSkillCatalogQuery();
  const triggersQuery = useAiTriggersQuery();

  const agents = useMemo(
    () =>
      buildAgentCatalogEntries({
        agents: agentsQuery.data?.agents ?? [],
        documents: catalogQuery.data?.documents ?? [],
      }),
    [agentsQuery.data?.agents, catalogQuery.data?.documents]
  );

  const workspaceNavActions = useMemo(
    () =>
      (actionsQuery.data?.actions ?? []).toSorted(
        compareCoreModuleThenModuleName
      ),
    [actionsQuery.data?.actions]
  );

  const workspaceNavSkills = useMemo(
    () =>
      (skillsAdminQuery.data?.skills ?? []).toSorted((left, right) => {
        const leftModuleId = getSkillModuleId(left);
        const rightModuleId = getSkillModuleId(right);
        const leftCore = isCoreAgentModuleId(leftModuleId);
        const rightCore = isCoreAgentModuleId(rightModuleId);
        if (leftCore !== rightCore) {
          return leftCore ? -1 : 1;
        }
        return `${leftModuleId}:${left.name}`.localeCompare(
          `${rightModuleId}:${right.name}`
        );
      }),
    [skillsAdminQuery.data?.skills]
  );

  const selectedAgent = useMemo(
    () =>
      agents.find((agent) => agent.id === navigation.selectedAgentId) ?? null,
    [agents, navigation.selectedAgentId]
  );

  const agentDocuments = useMemo(
    () =>
      selectedAgent
        ? pickCatalogDocuments(selectedAgent.documents).map(
            toAiInstructionFileDocument
          )
        : [],
    [selectedAgent]
  );

  const selectedAgentActions = useMemo(
    () =>
      selectedAgent
        ? filterAgentActions(actionsQuery.data?.actions ?? [], selectedAgent.id)
        : [],
    [actionsQuery.data?.actions, selectedAgent]
  );

  const selectedAgentTriggers = useMemo(
    () =>
      selectedAgent
        ? filterAgentTriggers(triggersQuery.data?.triggers ?? [], {
            agentId: selectedAgent.id,
          })
        : [],
    [selectedAgent, triggersQuery.data?.triggers]
  );

  return {
    ...navigation,
    actionsQuery,
    agentDocuments,
    agents,
    agentsQuery,
    catalogQuery,
    selectedAgent,
    selectedAgentActions,
    selectedAgentTriggers,
    skillCatalogQuery,
    skillsAdminQuery,
    triggersQuery,
    workspaceNavActions,
    workspaceNavSkills,
  };
}
