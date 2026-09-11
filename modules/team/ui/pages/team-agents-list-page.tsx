import { useTranslation } from "@engenty/i18n/ui";
import {
  adminListCardsGridClassName,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Skeleton,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { Bot, ExternalLink } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useTeamAgentsListAgentUiSlice } from "../hooks/use-team-agent-ui-slice.js";
import { useTeamAgentsCatalogQuery } from "../hooks/use-team-agents-catalog-query.js";
import { useTeamModuleSecondaryShellNav } from "../hooks/use-team-module-secondary-shell-nav.js";
import { teamModulePageScrollPaddedShellClassName } from "../lib/team-page-shell.js";
import { teamAgentDetailPath } from "../team-paths.js";

export function TeamAgentsListPage() {
  const { t } = useTranslation("team");
  const navigate = useNavigate();
  const shellNav = useTeamModuleSecondaryShellNav();
  const { agents, catalogAvailable, isLoading, isError } =
    useTeamAgentsCatalogQuery();
  useTeamAgentsListAgentUiSlice({ agents });

  usePageConfig({
    breadcrumbs: [
      ...(shellNav.moduleRootCrumb ? [shellNav.moduleRootCrumb] : []),
      { label: t("sidebar.nav_agents") },
    ],
    secondaryNavAfterItems: shellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: shellNav.secondaryNavHeaderSlot,
  });

  return (
    <section className={teamModulePageScrollPaddedShellClassName}>
      {!catalogAvailable && (
        <p className="text-muted-foreground text-sm">
          {t("agents.catalogUnavailable")}
        </p>
      )}
      {isLoading && (
        <div className={adminListCardsGridClassName()}>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton className="h-24 rounded-lg" key={`agent-skel-${i}`} />
          ))}
        </div>
      )}
      {!isLoading && isError && (
        <p className="text-destructive text-sm">{t("agents.loadFailed")}</p>
      )}
      {!(isLoading || isError) && agents.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t("agents.emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("agents.emptyDescription")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {!isLoading && agents.length > 0 && (
        <div className={adminListCardsGridClassName()}>
          {agents.map((agent) => (
            <button
              className="ui-card-raised p-4 text-left"
              key={agent.id}
              onClick={() => navigate(teamAgentDetailPath(agent.id))}
              type="button"
            >
              <div className="flex items-start gap-2">
                <Bot
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <div className="min-w-0">
                  <p className="font-medium">{agent.name}</p>
                  {agent.role ? (
                    <p className="text-muted-foreground text-sm">
                      {agent.role}
                    </p>
                  ) : null}
                  {agent.description ? (
                    <p className="mt-1 line-clamp-2 text-muted-foreground text-sm">
                      {agent.description}
                    </p>
                  ) : null}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      <div className="mt-auto">
        <Button asChild size="sm" variant="outline">
          <Link to="/admin/engenty/agents">
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            {t("agents.openAdminCatalog")}
          </Link>
        </Button>
      </div>
    </section>
  );
}
