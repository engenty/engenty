// Workforce card (ui-6 §2 card view): title row + role badge, muted meta row
// with id, source badge, and capability counts. Mirrors the tasks list cards.

import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Card,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import { Bot, MoreVertical } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { AiRegisteredAgent } from "../../lib/admin/ai-runtime-types";
import {
  AgentRoleBadge,
  AgentSourceBadge,
} from "../agents-workspace/agent-badges";
import { buildAgentDetailPath } from "../agents-workspace/agent-workspace-paths";
import { AgentActionsMenuItems } from "./agent-actions-menu";

export function AgentCapabilityCounts({ agent }: { agent: AiRegisteredAgent }) {
  const { t } = useTranslation("ai-ui");
  const parts = [
    t("agentsCatalog.counts.tools", { count: agent.tools?.length ?? 0 }),
    t("agentsCatalog.counts.skills", { count: agent.skills.length }),
  ];
  return <span className="whitespace-nowrap">{parts.join(" · ")}</span>;
}

export function AgentCard({
  agent,
  onDelete,
  onReset,
}: {
  agent: AiRegisteredAgent;
  onDelete: (agent: AiRegisteredAgent) => void;
  onReset: (agent: AiRegisteredAgent) => void;
}) {
  const navigate = useNavigate();
  return (
    <Card
      className="cursor-pointer p-4 transition-shadow hover:shadow-[var(--e-3)]"
      onClick={() => navigate(buildAgentDetailPath(agent.id))}
      variant="form"
    >
      <div className="flex items-start gap-3">
        <Bot
          aria-hidden
          className="mt-0.5 size-4 shrink-0 text-muted-foreground opacity-80"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate font-medium text-sm">{agent.name}</p>
            <AgentRoleBadge role={agent.role} />
          </div>
          {agent.description ? (
            <p className="mt-1 line-clamp-2 text-muted-foreground text-sm">
              {agent.description}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
            <span className="truncate font-mono">{agent.id}</span>
            <AgentSourceBadge
              moduleId={agent.module_id}
              source={agent.source}
            />
            <AgentCapabilityCounts agent={agent} />
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              className="size-7 shrink-0"
              onClick={(event) => event.stopPropagation()}
              size="icon"
              variant="ghost"
            >
              <MoreVertical aria-hidden className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onClick={(event) => event.stopPropagation()}
          >
            <AgentActionsMenuItems
              agent={agent}
              onDelete={onDelete}
              onReset={onReset}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  );
}
