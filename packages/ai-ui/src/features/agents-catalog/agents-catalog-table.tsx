// Grouped table view for the agents catalog: Agent / Role / Source / Capabilities.

import { useTranslation } from "@engenty/i18n/ui";
import {
  AdminListGroupHeader,
  AdminListGroupPill,
  cn,
  STICKY_HEADER_CLASS,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowActions,
} from "@engenty/ui-core";
import { Bot } from "lucide-react";
import { Fragment } from "react";
import { useNavigate } from "react-router-dom";
import type { AiRegisteredAgent } from "../../lib/admin/ai-runtime-types";
import {
  AgentRoleBadge,
  AgentSourceBadge,
} from "../agents-workspace/agent-badges";
import { buildAgentDetailPath } from "../agents-workspace/agent-workspace-paths";
import { AgentActionsMenuItems } from "./agent-actions-menu";
import { AgentCapabilityCounts } from "./agent-card";
import type { AgentCatalogGroupView } from "./agents-catalog-state";

const rowBodyBaseClass = cn(
  "[--ui-canvas-row-divider-w:0px]",
  "[&>tr:hover>td]:bg-muted/50 [&>tr>td]:bg-card",
  "[&>tr>td:first-child]:pl-4"
);

/** Per-group card chrome — only when grouped (a flat list gets no card). */
const groupCardChromeClass = cn(
  "ui-canvas-raised rounded-md",
  "[&>tr:first-child>td:first-child]:rounded-tl-md",
  "[&>tr:first-child>td:last-child]:rounded-tr-md",
  "[&>tr:last-child>td:first-child]:rounded-bl-md",
  "[&>tr:last-child>td:last-child]:rounded-br-md"
);

interface AgentsCatalogTableProps {
  grouped: boolean;
  groups: AgentCatalogGroupView[];
  isGroupOpen: (id: string) => boolean;
  onDelete: (agent: AiRegisteredAgent) => void;
  onReset: (agent: AiRegisteredAgent) => void;
  onToggleGroup: (id: string) => void;
}

export function AgentsCatalogTable({
  grouped,
  groups,
  isGroupOpen,
  onDelete,
  onReset,
  onToggleGroup,
}: AgentsCatalogTableProps) {
  const { t } = useTranslation("ai-ui");
  const navigate = useNavigate();

  const groupCountLabel = (count: number) =>
    `${count} ${count === 1 ? t("agentsCatalog.groupCountSingular") : t("agentsCatalog.groupCountPlural")}`;

  return (
    <Table className="mb-2" noWrapper>
      <TableHeader className={STICKY_HEADER_CLASS}>
        <TableRow className="group hover:bg-transparent [&>th:first-child]:pl-4">
          <TableHead>{t("agentsCatalog.columnAgent")}</TableHead>
          <TableHead>{t("agentsCatalog.columnRole")}</TableHead>
          <TableHead>{t("agentsCatalog.columnSource")}</TableHead>
          <TableHead>{t("agentsCatalog.columnCapabilities")}</TableHead>
          <TableHead className="w-[40px] px-1" />
        </TableRow>
      </TableHeader>
      {groups.map((group) => {
        const open = grouped ? isGroupOpen(group.id) : true;
        return (
          <Fragment key={group.id}>
            {grouped ? (
              <TableBody>
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    className="border-0 bg-transparent px-0 pt-4 pb-1"
                    colSpan={5}
                  >
                    <AdminListGroupHeader
                      count={groupCountLabel(group.agents.length)}
                      onToggle={() => onToggleGroup(group.id)}
                      open={open}
                      toggleLabel={t("agentsCatalog.toggleGroup")}
                    >
                      <AdminListGroupPill>{group.label}</AdminListGroupPill>
                    </AdminListGroupHeader>
                  </TableCell>
                </TableRow>
              </TableBody>
            ) : null}
            {open ? (
              <TableBody
                className={cn(
                  rowBodyBaseClass,
                  grouped && groupCardChromeClass
                )}
              >
                {group.agents.map((agent) => (
                  <TableRow
                    className="cursor-pointer"
                    key={agent.id}
                    onClick={() => navigate(buildAgentDetailPath(agent.id))}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Bot
                          aria-hidden
                          className="size-4 shrink-0 text-muted-foreground opacity-80"
                        />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-sm">
                            {agent.name}
                          </p>
                          <p className="truncate font-mono text-muted-foreground text-xs">
                            {agent.id}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <AgentRoleBadge role={agent.role} />
                    </TableCell>
                    <TableCell>
                      <AgentSourceBadge
                        moduleId={agent.module_id}
                        source={agent.source}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      <AgentCapabilityCounts agent={agent} />
                    </TableCell>
                    <TableRowActions>
                      <AgentActionsMenuItems
                        agent={agent}
                        onDelete={onDelete}
                        onReset={onReset}
                      />
                    </TableRowActions>
                  </TableRow>
                ))}
              </TableBody>
            ) : null}
          </Fragment>
        );
      })}
    </Table>
  );
}
