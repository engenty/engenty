// Identity card for the agent detail Overview tab (ui-6 §3):
// id, role + source badges, model, owning module.

import { SettingsFormSection } from "@engenty/ui-core";
import type { AiAgentEntry } from "../../lib/admin/ai-runtime-api";
import { AgentRoleBadge, AgentSourceBadge } from "./agent-badges";

/**
 * One labelled identity fact. Exported because the Space-side Manage tab shows
 * the same facts and must not draw them a second, slightly-different way.
 */
export function AgentIdentityRow(props: {
  compact?: boolean;
  label: string;
  value: string;
}) {
  if (props.compact) {
    return (
      <div className="flex items-center justify-between gap-3">
        <dt className="shrink-0 text-muted-foreground text-sm">
          {props.label}
        </dt>
        <dd className="m-0 min-w-0 truncate text-right font-mono text-sm">
          {props.value}
        </dd>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <dt className="w-32 shrink-0 text-muted-foreground text-xs uppercase tracking-wide">
        {props.label}
      </dt>
      <dd className="m-0 min-w-0 break-all font-mono text-sm">{props.value}</dd>
    </div>
  );
}

export function AgentIdentityCard({
  agent,
  t,
}: {
  agent: AiAgentEntry;
  t: (key: string) => string;
}) {
  const owningModule = agent.managed_by_module ?? agent.module_id;
  return (
    <SettingsFormSection
      description={t("agentDetail.identityDescription")}
      title={t("agentDetail.identityTitle")}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <AgentRoleBadge role={agent.role} />
          <AgentSourceBadge moduleId={agent.module_id} source={agent.source} />
        </div>
        <dl className="m-0 space-y-2">
          <AgentIdentityRow
            label={t("agentDetail.identityId")}
            value={agent.id}
          />
          <AgentIdentityRow
            label={t("agentDetail.identityModel")}
            value={agent.model ?? t("agentDetail.identityModelDefault")}
          />
          <AgentIdentityRow
            label={t("agentDetail.identityModule")}
            value={owningModule}
          />
        </dl>
      </div>
    </SettingsFormSection>
  );
}
