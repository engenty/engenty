// Overview workforce strip (ui-6 §1): count cards per role group, each
// linking into the agents catalog with the matching filter pre-applied.

import { useTranslation } from "@engenty/i18n/ui";
import { cn, Skeleton } from "@engenty/ui-core";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useAiAgentsQuery } from "../../lib/admin/ai-runtime-queries";
import { AGENTS_CATALOG_ROOT_PATH } from "../agents-workspace/agent-workspace-paths";
import { countWorkforce } from "./overview-counts";

const WORKFORCE_CARDS = [
  {
    group: "leadership",
    labelKey: "overview.workforce.leadership",
    search: "role=copilot",
  },
  {
    group: "specialists",
    labelKey: "overview.workforce.specialists",
    search: "role=specialist",
  },
  {
    group: "chat_surfaces",
    labelKey: "overview.workforce.chatSurfaces",
    search: "role=chat_surface",
  },
  {
    group: "external",
    labelKey: "overview.workforce.external",
    search: "role=external",
  },
  {
    group: "custom",
    labelKey: "overview.workforce.custom",
    search: "source=custom",
  },
] as const;

export function WorkforceStrip() {
  const { t } = useTranslation("ai-ui");
  const agentsQuery = useAiAgentsQuery();
  const counts = useMemo(
    () => countWorkforce(agentsQuery.data?.agents ?? []),
    [agentsQuery.data?.agents]
  );

  return (
    <section aria-label={t("overview.workforce.title")}>
      <h2 className="pb-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {t("overview.workforce.title")}
      </h2>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {WORKFORCE_CARDS.map((card) => (
          <Link
            className={cn(
              "ui-canvas-raised block rounded-md bg-card px-3.5 py-3",
              "transition-colors hover:bg-accent/40"
            )}
            key={card.group}
            to={`${AGENTS_CATALOG_ROOT_PATH}?${card.search}`}
          >
            {agentsQuery.isLoading ? (
              <Skeleton className="h-7 w-10 rounded" />
            ) : (
              <p className="font-semibold text-2xl tabular-nums">
                {counts[card.group]}
              </p>
            )}
            <p className="mt-1 truncate text-muted-foreground text-sm">
              {t(card.labelKey)}
            </p>
          </Link>
        ))}
      </div>
      {!agentsQuery.isLoading &&
      (agentsQuery.data?.agents ?? []).length === 0 ? (
        <p className="pt-2 text-muted-foreground text-sm">
          {t("overview.workforce.emptyHint")}
        </p>
      ) : null}
    </section>
  );
}
