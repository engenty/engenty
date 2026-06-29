// /admin/engenty/activity — chronological audit feed of sessions + runs (ui-6 §5).

import { useTranslation } from "@engenty/i18n/ui";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { ArrowRight } from "lucide-react";
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type {
  ActivityFilterState,
  ActivityStatusFilter,
} from "../features/activity/activity-entries";
import { ActivityFeed } from "../features/activity/activity-feed";
import { ActivityFilterBar } from "../features/activity/activity-filter-bar";
import { useActivityFeed } from "../features/activity/use-activity-feed";
import { AGENTS_WORKSPACE_ROOT_PATH } from "../features/agents-workspace/agent-workspace-paths";
import { useAgentsWorkspaceShellNav } from "../features/agents-workspace/use-agents-workspace-shell-nav";
import { useWorkspaceNavData } from "../features/agents-workspace/use-workspace-nav-data";

const OPERATIONS_COCKPIT_PATH = "/mdl/tasks/operations";
const STATUS_VALUES = new Set(["all", "running", "failed", "finished"]);

function readFilters(searchParams: URLSearchParams): ActivityFilterState {
  const status = searchParams.get("status") ?? "all";
  return {
    agentId: searchParams.get("agent"),
    search: searchParams.get("q") ?? "",
    status: (STATUS_VALUES.has(status)
      ? status
      : "all") as ActivityStatusFilter,
  };
}

export function ActivityPage() {
  const { t } = useTranslation("ai-ui");
  const nav = useWorkspaceNavData();
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo(() => readFilters(searchParams), [searchParams]);
  const feed = useActivityFeed({ filters });

  const agents = useMemo(
    () =>
      nav.agents
        .map((agent) => ({ id: agent.id, name: agent.name }))
        .toSorted((left, right) => left.name.localeCompare(right.name)),
    [nav.agents]
  );
  const agentNameById = useMemo(
    () => new Map(agents.map((agent) => [agent.id, agent.name])),
    [agents]
  );

  const shellNav = useAgentsWorkspaceShellNav({ ...nav, selectedAgentId: "" });
  usePageConfig({
    breadcrumbs: [
      { label: t("menu.engenty"), to: AGENTS_WORKSPACE_ROOT_PATH },
      { label: t("activity.title") },
    ],
    contentStackBackground: "paper",
    secondaryNavAfterItems: shellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: shellNav.secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
  });

  const applyFilters = (next: ActivityFilterState) => {
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current);
        const entries: [string, string | null][] = [
          ["agent", next.agentId],
          ["q", next.search.trim() ? next.search : null],
          ["status", next.status === "all" ? null : next.status],
        ];
        for (const [key, value] of entries) {
          if (value) {
            params.set(key, value);
          } else {
            params.delete(key);
          }
        }
        return params;
      },
      { replace: true }
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden p-page">
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-4">
        <div className="shrink-0">
          <p className="font-semibold text-xl">{t("activity.title")}</p>
          <p className="text-muted-foreground text-sm">
            {t("activity.description")}
          </p>
        </div>
        <Link
          className="flex shrink-0 items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-muted-foreground text-sm transition hover:bg-muted/70 hover:text-foreground"
          to={OPERATIONS_COCKPIT_PATH}
        >
          <span>{t("activity.cockpitBanner")}</span>
          <span className="ml-auto inline-flex items-center gap-1 font-medium">
            {t("activity.cockpitBannerLink")}
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </Link>
        <ActivityFilterBar
          agents={agents}
          filters={filters}
          onChange={applyFilters}
          t={t}
        />
        <ActivityFeed
          agentNameById={agentNameById}
          groups={feed.groups}
          isError={feed.isError}
          isLoading={feed.isLoading}
        />
      </div>
    </div>
  );
}
