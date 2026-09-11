// Capabilities tab (ui-6 §3): effective tools + preferred skills.
// Reuses the settings-tab fragments (skills panel, effective tools panel).

import { SettingsFormSection } from "@engenty/ui-core";
import type {
  AiAgentEntry,
  AiRegisteredAction,
  AiSkillCatalogEntry,
} from "../../lib/admin/ai-runtime-api";
import { AgentConnectionsPanel } from "./agent-connections-panel";
import {
  AgentEffectiveToolsPanel,
  AgentSkillsPanel,
} from "./agent-skills-panel";

interface AgentCapabilitiesTabProps {
  actions: AiRegisteredAction[];
  agent: AiAgentEntry;
  isSkillsLoading: boolean;
  skills: AiSkillCatalogEntry[];
  t: (key: string) => string;
}

export function AgentCapabilitiesTab({
  actions,
  agent,
  isSkillsLoading,
  skills,
  t,
}: AgentCapabilitiesTabProps) {
  return (
    <div className="space-y-6">
      <SettingsFormSection
        cardClassName="overflow-hidden p-0 sm:p-0"
        description={t("agents.settingsOverview.toolsDescription")}
        title={t("agents.settingsOverview.toolsTitle")}
      >
        <AgentEffectiveToolsPanel
          actions={actions}
          agent={agent}
          isLoading={isSkillsLoading}
          skills={skills}
          t={t}
        />
      </SettingsFormSection>
      <SettingsFormSection
        cardClassName="overflow-hidden p-0 sm:p-0"
        description={t("agents.settingsOverview.skillsDescription")}
        title={t("agents.settingsOverview.skillsTitle")}
      >
        <AgentSkillsPanel
          actions={actions}
          agent={agent}
          embedded
          isLoading={isSkillsLoading}
          skills={skills}
          t={t}
        />
      </SettingsFormSection>
      {/* Connected accounts this agent may use in unattended runs (CN.5).
          Here, on Capabilities, because that is the tab that answers "what can
          this agent do" — and lending it a mailbox is exactly that. */}
      <SettingsFormSection
        cardClassName="overflow-hidden p-0 sm:p-0"
        description={t("agentConnections.description")}
        title={t("agentConnections.title")}
      >
        <AgentConnectionsPanel agentId={agent.id} />
      </SettingsFormSection>
    </div>
  );
}
