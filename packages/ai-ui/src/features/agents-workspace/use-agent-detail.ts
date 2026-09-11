import { useMemo } from "react";
import {
  useAiAgentsQuery,
  useAiSkillCatalogQuery,
  useAiSkillsQuery,
  useAiTriggersQuery,
  useAiWorkflowsQuery,
} from "../../lib/admin/ai-runtime-queries";
import { toAiInstructionFileDocument } from "../../lib/admin/instruction-settings-api";
import { useAiInstructionsCatalogQuery } from "../../lib/admin/instruction-settings-queries";
import {
  buildAgentCatalogEntries,
  filterAgentActions,
  filterAgentTriggers,
  isCoreAgentModuleId,
} from "../ai-settings/agent-catalog";
import {
  instructionOverrideFlagsByKey,
  pickCatalogDocuments,
} from "../ai-settings/instruction-groups";
import { getSkillModuleId } from "./skill-record-utils";
import { useAgentsWorkspaceNavigation } from "./use-agents-workspace-navigation";
import { useFlowCatalog, useSelectFlow } from "./use-flow-catalog";

export function useAgentDetail() {
  const navigation = useAgentsWorkspaceNavigation();
  const catalogQuery = useAiInstructionsCatalogQuery();
  const agentsQuery = useAiAgentsQuery();
  const actionsQuery = useAiWorkflowsQuery();
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

  const { flows: workspaceNavFlows, flowsLoading } = useFlowCatalog();
  const navigateToFlow = useSelectFlow();

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

  const instructionOverridesByKey = useMemo(
    () => instructionOverrideFlagsByKey(selectedAgent?.documents ?? []),
    [selectedAgent?.documents]
  );

  const selectedAgentActions = useMemo(
    () =>
      selectedAgent
        ? filterAgentActions(
            actionsQuery.data?.workflows ?? [],
            selectedAgent.id
          )
        : [],
    [actionsQuery.data?.workflows, selectedAgent]
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
    instructionOverridesByKey,
    agents,
    agentsQuery,
    catalogQuery,
    selectedAgent,
    selectedAgentActions,
    selectedAgentTriggers,
    skillCatalogQuery,
    skillsAdminQuery,
    flowsLoading,
    navigateToFlow,
    triggersQuery,
    workspaceNavFlows,
    workspaceNavSkills,
  };
}
