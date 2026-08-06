// Overview hub cards — Plan briefing pattern: click anywhere opens the
// catalog; create CTAs stay interactive above the stretch link.

import { useTranslation } from "@engenty/i18n/ui";
import { cn } from "@engenty/ui-core";
import {
  Bot,
  FileTerminal,
  ListChecks,
  type LucideIcon,
  Wrench,
} from "lucide-react";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  useAiActionsQuery,
  useAiAgentsQuery,
  useAiSkillsQuery,
  useAiToolsQuery,
} from "../../lib/admin/ai-runtime-queries";
import {
  ACTIONS_CATALOG_ROOT_PATH,
  AGENTS_CATALOG_ROOT_PATH,
  buildAgentCreatePath,
  buildToolCreatePath,
  SKILLS_CATALOG_ROOT_PATH,
  TOOLS_ROOT_PATH,
} from "../agents-workspace/agent-workspace-paths";
import { countActions, countSkills, countTools } from "./overview-counts";

function HubCard({
  ctaKind,
  ctaLabel,
  description,
  icon: Icon,
  onCta,
  title,
  to,
}: {
  ctaKind: "open" | "create";
  ctaLabel: string;
  description: string;
  icon: LucideIcon;
  onCta?: () => void;
  title: string;
  to: string;
}) {
  return (
    <div
      className={cn(
        "ui-canvas-raised group relative flex min-h-[5.5rem] flex-col gap-2.5 rounded-md bg-card px-3.5 py-3",
        "transition-colors hover:bg-accent/40"
      )}
    >
      <Link
        aria-label={title}
        className="absolute inset-0 z-0 rounded-md"
        to={to}
      />
      <div className="pointer-events-none relative z-10 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 font-semibold text-sm group-hover:text-primary">
          <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{title}</span>
        </div>
      </div>
      <p className="pointer-events-none relative z-10 flex-1 text-muted-foreground text-xs leading-snug">
        {description}
      </p>
      {ctaKind === "open" ? (
        <span className="pointer-events-none relative z-10 w-fit font-semibold text-primary text-xs">
          {ctaLabel}
        </span>
      ) : (
        <button
          className="relative z-10 w-fit font-semibold text-primary text-xs hover:underline"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onCta?.();
          }}
          type="button"
        >
          {ctaLabel}
        </button>
      )}
    </div>
  );
}

interface OverviewHubCardsProps {
  onCreateSkill: () => void;
}

export function OverviewHubCards({ onCreateSkill }: OverviewHubCardsProps) {
  const { t } = useTranslation("ai-ui");
  const navigate = useNavigate();
  const agentsQuery = useAiAgentsQuery();
  const skillsQuery = useAiSkillsQuery();
  const toolsQuery = useAiToolsQuery();
  const actionsQuery = useAiActionsQuery();

  const agentsCount = agentsQuery.data?.agents?.length ?? 0;
  const skillCounts = useMemo(
    () => countSkills(skillsQuery.data?.skills ?? []),
    [skillsQuery.data?.skills]
  );
  const toolCounts = useMemo(
    () => countTools(toolsQuery.data?.tools ?? []),
    [toolsQuery.data?.tools]
  );
  const actionCounts = useMemo(
    () => countActions(actionsQuery.data?.actions ?? []),
    [actionsQuery.data?.actions]
  );

  return (
    <nav
      aria-label={t("overview.hubs.navAria")}
      className="grid grid-cols-2 gap-2.5 md:grid-cols-4"
    >
      <HubCard
        ctaKind="create"
        ctaLabel={t("overview.quickActions.newAgent")}
        description={t("overview.hubs.agentsCount", { count: agentsCount })}
        icon={Bot}
        onCta={() => navigate(buildAgentCreatePath())}
        title={t("workspace.sidebarAgents")}
        to={AGENTS_CATALOG_ROOT_PATH}
      />
      <HubCard
        ctaKind="create"
        ctaLabel={t("overview.quickActions.newSkill")}
        description={t("overview.capabilities.skillsBreakdown", {
          ...skillCounts,
          defaultValue: "{{managed}} managed · {{custom}} custom",
        })}
        icon={FileTerminal}
        onCta={onCreateSkill}
        title={t("workspace.sidebarSkills")}
        to={SKILLS_CATALOG_ROOT_PATH}
      />
      <HubCard
        ctaKind="open"
        ctaLabel={t("overview.hubs.open")}
        description={t("overview.capabilities.actionsBreakdown", {
          ...actionCounts,
          defaultValue: "{{shipped}} shipped · {{custom}} custom",
        })}
        icon={ListChecks}
        title={t("workspace.sidebarActions")}
        to={ACTIONS_CATALOG_ROOT_PATH}
      />
      <HubCard
        ctaKind="create"
        ctaLabel={t("overview.quickActions.newTool")}
        description={t("overview.capabilities.toolsBreakdown", toolCounts)}
        icon={Wrench}
        onCta={() => navigate(buildToolCreatePath())}
        title={t("workspace.sidebarTools")}
        to={TOOLS_ROOT_PATH}
      />
    </nav>
  );
}
