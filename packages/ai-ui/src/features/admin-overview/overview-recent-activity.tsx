// Overview recent-activity panel (ui-6 §1): last ~5 feed entries reusing the
// activity feature's merge hook + row component, linking into /activity.

import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAiAgentsQuery } from "../../lib/admin/ai-runtime-queries";
import type { ActivityEntry } from "../activity/activity-entries";
import { ActivityFeedItem } from "../activity/activity-feed-item";
import { useActivityFeed } from "../activity/use-activity-feed";
import {
  ACTIVITY_ROOT_PATH,
  buildAgentSessionDetailPath,
} from "../agents-workspace/agent-workspace-paths";

const RECENT_ACTIVITY_LIMIT = 5;

export function OverviewRecentActivity() {
  const { t } = useTranslation("ai-ui");
  const navigate = useNavigate();
  const agentsQuery = useAiAgentsQuery();
  const feed = useActivityFeed({
    filters: { agentId: null, search: "", status: "all" },
  });

  const entries = useMemo(
    () => feed.entries.slice(0, RECENT_ACTIVITY_LIMIT),
    [feed.entries]
  );
  const agentNameById = useMemo(
    () =>
      new Map(
        (agentsQuery.data?.agents ?? []).map((agent) => [agent.id, agent.name])
      ),
    [agentsQuery.data?.agents]
  );

  const handleSelect = (entry: ActivityEntry) => {
    if (!entry.agentId) {
      return;
    }
    navigate(buildAgentSessionDetailPath(entry.agentId, entry.entityId));
  };

  return (
    <section aria-label={t("overview.activity.title")}>
      <div className="flex items-center justify-between pb-2">
        <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
          {t("overview.activity.title")}
        </h2>
        <Button asChild size="sm" variant="ghost">
          <Link to={ACTIVITY_ROOT_PATH}>{t("overview.activity.viewAll")}</Link>
        </Button>
      </div>
      {feed.isLoading ? (
        <p className="text-muted-foreground text-sm">{t("activity.loading")}</p>
      ) : null}
      {!feed.isLoading && feed.isError ? (
        <p className="text-destructive text-sm">{t("activity.error")}</p>
      ) : null}
      {!(feed.isLoading || feed.isError) && entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t("overview.activity.empty")}
        </p>
      ) : null}
      {entries.length > 0 ? (
        <div className="ui-card-raised overflow-hidden">
          {entries.map((entry) => (
            <ActivityFeedItem
              agentName={
                entry.agentId
                  ? (agentNameById.get(entry.agentId) ?? null)
                  : null
              }
              entry={entry}
              key={entry.key}
              onSelect={handleSelect}
              t={t}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
