// Overview capability cards (ui-6 §1): Skills / Tools / Flows counts with
// a short name preview and a link into each catalog.

import { useTranslation } from "@engenty/i18n/ui";
import { Skeleton } from "@engenty/ui-core";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  useAiSkillsQuery,
  useAiToolsQuery,
} from "../../lib/admin/ai-runtime-queries";
import {
  SKILLS_CATALOG_ROOT_PATH,
  TOOLS_ROOT_PATH,
  WORKFLOWS_CATALOG_ROOT_PATH,
} from "../agents-workspace/agent-workspace-paths";
import { useFlowCatalog } from "../agents-workspace/use-flow-catalog";
import {
  countFlows,
  countSkills,
  countTools,
  previewNames,
} from "./overview-counts";

function CapabilityCard({
  breakdown,
  count,
  emptyHint,
  isLoading,
  names,
  title,
  to,
}: {
  breakdown: string;
  count: number;
  emptyHint: string;
  isLoading: boolean;
  names: string[];
  title: string;
  to: string;
}): ReactNode {
  return (
    <Link className="ui-card-raised block h-full space-y-2 p-4" to={to}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-sm">{title}</p>
        <ArrowRight aria-hidden className="size-4 text-muted-foreground" />
      </div>
      {isLoading ? (
        <Skeleton className="h-7 w-10 rounded" />
      ) : (
        <p className="font-semibold text-2xl tabular-nums">{count}</p>
      )}
      <p className="text-muted-foreground text-xs">{breakdown}</p>
      <p className="line-clamp-2 break-words text-muted-foreground text-xs">
        {names.length > 0 ? names.join(" · ") : emptyHint}
      </p>
    </Link>
  );
}

export function CapabilityCards() {
  const { t } = useTranslation("ai-ui");
  const skillsQuery = useAiSkillsQuery();
  const toolsQuery = useAiToolsQuery();
  const { flows, flowsLoading } = useFlowCatalog();

  const skills = useMemo(
    () => skillsQuery.data?.skills ?? [],
    [skillsQuery.data?.skills]
  );
  const tools = useMemo(
    () => toolsQuery.data?.tools ?? [],
    [toolsQuery.data?.tools]
  );
  const skillCounts = countSkills(skills);
  const toolCounts = countTools(tools);
  const flowCounts = countFlows(flows);

  return (
    <section aria-label={t("overview.capabilities.title")}>
      <h2 className="pb-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {t("overview.capabilities.title")}
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <CapabilityCard
          breakdown={t("overview.capabilities.skillsBreakdown", {
            ...skillCounts,
            defaultValue: "{{managed}} managed · {{custom}} custom",
          })}
          count={skillCounts.total}
          emptyHint={t("overview.capabilities.skillsEmpty")}
          isLoading={skillsQuery.isLoading}
          names={previewNames(skills)}
          title={t("overview.capabilities.skillsTitle")}
          to={SKILLS_CATALOG_ROOT_PATH}
        />
        <CapabilityCard
          breakdown={t("overview.capabilities.toolsBreakdown", toolCounts)}
          count={toolCounts.total}
          emptyHint={t("overview.capabilities.toolsEmpty")}
          isLoading={toolsQuery.isLoading}
          names={previewNames(tools)}
          title={t("overview.capabilities.toolsTitle")}
          to={TOOLS_ROOT_PATH}
        />
        <CapabilityCard
          breakdown={t("overview.hubs.flowsBreakdown", {
            ...flowCounts,
            defaultValue:
              "{{live}} live · {{draft}} in draft · {{declared}} declared",
          })}
          count={flowCounts.total}
          emptyHint={t("workflows.empty")}
          isLoading={flowsLoading}
          names={previewNames(flows)}
          title={t("workspace.sidebarFlows")}
          to={WORKFLOWS_CATALOG_ROOT_PATH}
        />
      </div>
    </section>
  );
}
