// Role-grouped card grid (default catalog view): collapsible group headers per
// workforce group, responsive card grid.

import { useTranslation } from "@engenty/i18n/ui";
import {
  AdminListGroupHeader,
  AdminListGroupPill,
  adminListCardsGridClassName,
} from "@engenty/ui-core";
import { Fragment } from "react";
import type { AiRegisteredAgent } from "../../lib/admin/ai-runtime-types";
import { AgentCard } from "./agent-card";
import type { AgentCatalogGroupView } from "./agents-catalog-state";

export function AgentsCardGrid({
  groups,
  isGroupOpen,
  onDelete,
  onReset,
  onToggleGroup,
}: {
  groups: AgentCatalogGroupView[];
  isGroupOpen: (id: string) => boolean;
  onDelete: (agent: AiRegisteredAgent) => void;
  onReset: (agent: AiRegisteredAgent) => void;
  onToggleGroup: (id: string) => void;
}) {
  const { t } = useTranslation("ai-ui");

  const groupCountLabel = (count: number) =>
    `${count} ${count === 1 ? t("agentsCatalog.groupCountSingular") : t("agentsCatalog.groupCountPlural")}`;

  return (
    <div className="flex flex-col gap-2">
      {groups.map((group) => {
        const open = isGroupOpen(group.id);
        return (
          <Fragment key={group.id}>
            <AdminListGroupHeader
              count={groupCountLabel(group.agents.length)}
              onToggle={() => onToggleGroup(group.id)}
              open={open}
              toggleLabel={t("agentsCatalog.toggleGroup")}
            >
              <AdminListGroupPill>{group.label}</AdminListGroupPill>
            </AdminListGroupHeader>
            {open ? (
              <div className={`${adminListCardsGridClassName("normal")} mb-2`}>
                {group.agents.map((agent) => (
                  <AgentCard
                    agent={agent}
                    key={agent.id}
                    onDelete={onDelete}
                    onReset={onReset}
                  />
                ))}
              </div>
            ) : null}
          </Fragment>
        );
      })}
    </div>
  );
}
