// Overview tab of the agent "personnel file" (ui-6 §3): identity, job
// description, how work reaches the agent, and the test-chat card.

import { SettingsFormSection } from "@engenty/ui-core";
import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import type {
  AiAgentEntry,
  AiRegisteredAction,
} from "../../lib/admin/ai-runtime-api";
import type { AiInstructionFileDocument } from "../../lib/admin/instruction-settings-api";
import { AgentChatTriggersCard } from "./agent-chat-triggers-card";
import type { AgentDetailAffordances } from "./agent-detail-tabs";
import { AgentIdentityCard } from "./agent-identity-card";
import { AgentJobDescriptionCard } from "./agent-job-description-card";
import { AgentRoutinesTriggerCard } from "./agent-routines-trigger-card";
import { AgentWorkSourcesCard } from "./agent-work-sources-card";

const CHATBOT_ADMIN_PATH = "/mdl/chatbot/manage";

function ExternalAgentBanner({ t }: { t: (key: string) => string }) {
  return (
    <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-3">
      <p className="font-medium text-sm">
        {t("agentDetail.externalBannerTitle")}
      </p>
      <p className="mt-1 text-muted-foreground text-sm">
        {t("agentDetail.externalBannerDescription")}
      </p>
      <Link
        className="mt-2 inline-flex items-center gap-1.5 font-medium text-primary text-sm hover:underline"
        to={CHATBOT_ADMIN_PATH}
      >
        {t("agentDetail.externalBannerLink")}
        <ExternalLink aria-hidden className="size-3.5" />
      </Link>
    </div>
  );
}

interface AgentOverviewTabProps {
  affordances: AgentDetailAffordances;
  agent: AiAgentEntry;
  agentActions: AiRegisteredAction[];
  documents: AiInstructionFileDocument[];
  onOpenInstruction: (documentKey: string) => void;
  t: (key: string) => string;
}

export function AgentOverviewTab({
  affordances,
  agent,
  agentActions,
  documents,
  onOpenInstruction,
  t,
}: AgentOverviewTabProps) {
  return (
    <div className="space-y-6">
      {affordances.isExternal ? <ExternalAgentBanner t={t} /> : null}
      <AgentIdentityCard agent={agent} t={t} />
      <AgentJobDescriptionCard
        agent={agent}
        canEditAgent={affordances.canEditAgent}
        documents={documents}
        isExternal={affordances.isExternal}
        onOpenInstruction={onOpenInstruction}
        t={t}
      />
      <AgentWorkSourcesCard actions={agentActions} t={t} />
      {affordances.isExternal ? null : (
        <AgentRoutinesTriggerCard agentId={agent.id} />
      )}
      {affordances.isExternal ? null : (
        <SettingsFormSection
          cardClassName="px-2 py-0 sm:px-4 sm:py-0"
          description={t("agents.chatTriggers.subtitle")}
          title={t("agents.chatTriggers.title")}
        >
          <AgentChatTriggersCard
            agent={agent}
            hideActiveRow={agent.agent_origin === "registry"}
            t={t}
          />
        </SettingsFormSection>
      )}
    </div>
  );
}
