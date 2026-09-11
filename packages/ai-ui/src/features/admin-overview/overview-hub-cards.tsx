// Overview hub cards — Plan briefing pattern: click anywhere opens the
// catalog; create CTAs stay interactive above the stretch link.

import { useTranslation } from "@engenty/i18n/ui";
import {
  Bot,
  FileTerminal,
  type LucideIcon,
  Package,
  Workflow,
  Wrench,
} from "lucide-react";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAllArtifactsQuery } from "../../artifacts/artifacts-api";
import {
  useAiAgentsQuery,
  useAiSkillsQuery,
  useAiToolsQuery,
} from "../../lib/admin/ai-runtime-queries";
import {
  AGENTS_CATALOG_ROOT_PATH,
  ARTIFACTS_ROOT_PATH,
  buildAgentCreatePath,
  buildToolCreatePath,
  SKILLS_CATALOG_ROOT_PATH,
  TOOLS_ROOT_PATH,
  WORKFLOWS_CATALOG_ROOT_PATH,
} from "../agents-workspace/agent-workspace-paths";
import { useFlowCatalog } from "../agents-workspace/use-flow-catalog";
import {
  countArtifacts,
  countFlows,
  countSkills,
  countTools,
} from "./overview-counts";

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
    <div className="ui-card-raised ui-card-interactive group relative flex min-h-[5.5rem] flex-col gap-2.5 px-3.5 py-3">
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
  /** Opens the Flows create dialog, which lives on the page above. */
  onCreateFlow?: () => void;
  onCreateSkill: () => void;
}

export function OverviewHubCards({
  onCreateFlow,
  onCreateSkill,
}: OverviewHubCardsProps) {
  const { t } = useTranslation("ai-ui");
  const navigate = useNavigate();
  const agentsQuery = useAiAgentsQuery();
  const skillsQuery = useAiSkillsQuery();
  const toolsQuery = useAiToolsQuery();
  const { flows } = useFlowCatalog();
  const artifactsQuery = useAllArtifactsQuery();

  const agentsCount = agentsQuery.data?.agents?.length ?? 0;
  const skillCounts = useMemo(
    () => countSkills(skillsQuery.data?.skills ?? []),
    [skillsQuery.data?.skills]
  );
  const toolCounts = useMemo(
    () => countTools(toolsQuery.data?.tools ?? []),
    [toolsQuery.data?.tools]
  );
  const flowCounts = useMemo(() => countFlows(flows), [flows]);
  const artifactCounts = useMemo(
    () => countArtifacts(artifactsQuery.data ?? []),
    [artifactsQuery.data]
  );

  return (
    <nav
      aria-label={t("overview.hubs.navAria")}
      // Three across, two rows: six cards in a row of four would leave a
      // ragged 4 + 2, and at six-across each card is too narrow for its count
      // line.
      className="grid grid-cols-2 gap-2.5 md:grid-cols-3"
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
        ctaKind={onCreateFlow ? "create" : "open"}
        ctaLabel={onCreateFlow ? t("workflows.new") : t("overview.hubs.open")}
        description={t("overview.hubs.flowsBreakdown", {
          ...flowCounts,
          // Number-neutral: several counts in one string leave i18next's plural
          // rules (which key off a single `count`) with nothing to work from,
          // and "1 drafts" reads as a bug.
          defaultValue: "{{total}} actions · {{ready}} ready · {{draft}} draft",
        })}
        icon={Workflow}
        {...(onCreateFlow ? { onCta: onCreateFlow } : {})}
        title={t("workspace.sidebarFlows")}
        to={WORKFLOWS_CATALOG_ROOT_PATH}
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
      <HubCard
        // No create CTA: artifacts are produced by runs, not authored here.
        ctaKind="open"
        ctaLabel={t("overview.hubs.open")}
        description={t("overview.hubs.artifactsBreakdown", {
          ...artifactCounts,
          defaultValue: "{{agent}} by agents · {{user}} by people",
        })}
        icon={Package}
        title={t("workspace.sidebarArtifacts")}
        to={ARTIFACTS_ROOT_PATH}
      />
    </nav>
  );
}
