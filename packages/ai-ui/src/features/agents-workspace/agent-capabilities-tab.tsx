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
import { AgentSurfacePanel } from "./agent-surface-panel";

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
      {/* Plugins this agent may use (space-enabled subset + personal accounts). */}
      <SettingsFormSection
        cardClassName="overflow-hidden p-0 sm:p-0"
        description={t("agentConnections.description")}
        title={t("agentConnections.title")}
      >
        <AgentConnectionsPanel agentId={agent.id} />
      </SettingsFormSection>
      {/* Where else it may act: the person's screen, and remote channels as
          itself. Registry rows only — a module's agent declares these in its
          manifest, and the copilot always drives the screen. */}
      {agent.agent_origin === "custom" && agent.role !== "copilot" ? (
        <SettingsFormSection
          cardClassName="overflow-hidden p-0 sm:p-0"
          description={t("agentSurface.description")}
          title={t("agentSurface.title")}
        >
          <AgentSurfacePanel agentId={agent.id} />
        </SettingsFormSection>
      ) : null}
    </div>
  );
}
