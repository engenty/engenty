import { useTranslation } from "@engenty/i18n/ui";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  AGENTS_WORKSPACE_ROOT_PATH,
  buildActionDetailPath,
} from "../features/agents-workspace/agent-workspace-url-state";
import { useAgentsWorkspaceShellNav } from "../features/agents-workspace/use-agents-workspace-shell-nav";
import { useWorkspaceNavData } from "../features/agents-workspace/use-workspace-nav-data";
import { useAiActionsQuery } from "../lib/admin/ai-runtime-queries";

function sectionHeading(text: string) {
  return (
    <p className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
      {text}
    </p>
  );
}

export function ActionsCatalogPage() {
  const { t } = useTranslation("ai-ui");
  const nav = useWorkspaceNavData();
  const actionsQuery = useAiActionsQuery();

  const shellNav = useAgentsWorkspaceShellNav({
    ...nav,
    selectedAgentId: "",
  });
  const grouped = useMemo(() => {
    const actions = actionsQuery.data?.actions ?? [];
    return {
      core: actions.filter(
        (action) =>
          action.source_kind !== "user" && action.module_id === "engenty-core"
      ),
      module: actions.filter(
        (action) =>
          action.source_kind !== "user" && action.module_id !== "engenty-core"
      ),
    };
  }, [actionsQuery.data?.actions]);

  usePageConfig({
    breadcrumbs: [
      { label: t("menu.engenty"), to: AGENTS_WORKSPACE_ROOT_PATH },
      { label: t("workspace.sidebarActions") },
    ],
    contentStackBackground: "paper",
    secondaryNavAfterItems: shellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: shellNav.secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
  });

  return (
    <div className="min-h-0 flex-1 overflow-auto p-page">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div>
          <p className="font-semibold text-xl">
            {t("workspace.sidebarActions")}
          </p>
          <p className="text-muted-foreground text-sm">
            {t("actionsCatalog.description")}
          </p>
        </div>

        {actionsQuery.isLoading ? (
          <p className="text-muted-foreground text-sm">
            {t("actionsCatalog.loading")}
          </p>
        ) : null}

        {!actionsQuery.isLoading &&
        (actionsQuery.data?.actions ?? []).length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("actionsCatalog.empty")}
          </p>
        ) : null}

        {grouped.core.length > 0 ? (
          <section className="space-y-2">
            {sectionHeading(t("skills.origin.core"))}
            <div className="space-y-2">
              {grouped.core.map((action) => (
                <div
                  className="group rounded-lg bg-card px-4 py-3 shadow-sm transition-shadow hover:shadow-md"
                  key={action.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      className="min-w-0 flex-1"
                      to={buildActionDetailPath(action.id, {
                        file: "ACTION.md",
                      })}
                    >
                      <div className="flex min-w-0 items-baseline gap-2">
                        <p className="truncate font-medium text-foreground text-sm">
                          {action.name}
                        </p>
                        <p className="truncate text-muted-foreground text-xs">
                          {action.id}
                        </p>
                      </div>
                      {action.description ? (
                        <p className="mt-1 text-muted-foreground text-sm">
                          {action.description}
                        </p>
                      ) : null}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {grouped.module.length > 0 ? (
          <section className="space-y-3">
            {sectionHeading(t("skills.origin.module"))}
            {Array.from(
              new Set(grouped.module.map((action) => action.module_id))
            ).map((moduleId) => (
              <div className="space-y-2" key={moduleId}>
                <p className="font-medium text-foreground text-sm">
                  {moduleId}
                </p>
                <div className="space-y-2">
                  {grouped.module
                    .filter((action) => action.module_id === moduleId)
                    .map((action) => (
                      <div
                        className="group rounded-lg bg-card px-4 py-3 shadow-sm transition-shadow hover:shadow-md"
                        key={action.id}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <Link
                            className="min-w-0 flex-1"
                            to={buildActionDetailPath(action.id, {
                              file: "ACTION.md",
                            })}
                          >
                            <div className="flex min-w-0 items-baseline gap-2">
                              <p className="truncate font-medium text-foreground text-sm">
                                {action.name}
                              </p>
                              <p className="truncate text-muted-foreground text-xs">
                                {action.id}
                              </p>
                            </div>
                            {action.description ? (
                              <p className="mt-1 text-muted-foreground text-sm">
                                {action.description}
                              </p>
                            ) : null}
                          </Link>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </section>
        ) : null}
      </div>
    </div>
  );
}
