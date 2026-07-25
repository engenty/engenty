// Routed inbox page (/mdl/tasks/inbox) — the tenant's team inbox over Mastra
// notification records (task completions/failures, trigger errors, HITL).
import {
  type InboxNotificationDto,
  useInboxListQuery,
  useMarkAllInboxSeenMutation,
} from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import { Button, DetailPageHeader, Tabs } from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { CheckCheck, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { InboxList } from "../components/inbox/inbox-list.js";
import { InboxToolbar } from "../components/inbox/inbox-toolbar.js";
import { PlanListSubNav } from "../components/plan-list-sub-nav.js";
import { useTasksModuleSecondaryShellNav } from "../hooks/use-tasks-module-secondary-shell-nav.js";
import { useTasksTopbarActions } from "../hooks/use-tasks-topbar-actions.js";
import {
  type InboxKindFilter,
  matchesInboxKindFilter,
} from "../lib/inbox-classification.js";
import { usePlanListTabNavigation } from "../lib/use-plan-list-tab-navigation.js";

export function InboxPage() {
  const { t, i18n } = useTranslation("tasks");
  const locale = i18n.language || "en";
  const onPlanTabChange = usePlanListTabNavigation();
  const listQuery = useInboxListQuery({ limit: 100 });
  const markAllMutation = useMarkAllInboxSeenMutation();
  const { pageActions, topbarDialogs } = useTasksTopbarActions();
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<InboxKindFilter>("all");

  const { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot } =
    useTasksModuleSecondaryShellNav();
  const breadcrumbs = useMemo(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: t("tabs.inbox") },
    ],
    [moduleRootCrumb, t]
  );

  const notifications = listQuery.data?.notifications ?? [];
  const hasUnseen = notifications.some(
    (n: InboxNotificationDto) =>
      n.status === "pending" || n.status === "delivered"
  );

  const inboxActions = useMemo(
    () => (
      <div className="flex items-center gap-2">
        <Button
          className="gap-1.5"
          disabled={markAllMutation.isPending || !hasUnseen}
          onClick={() => markAllMutation.mutate()}
          size="sm"
          variant="outline"
        >
          {markAllMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCheck className="h-3.5 w-3.5" />
          )}
          {t("inbox.markAllSeen")}
        </Button>
        {pageActions}
      </div>
    ),
    [hasUnseen, markAllMutation, pageActions, t]
  );

  usePageConfig({
    actions: inboxActions,
    breadcrumbs,
    contentStackBackground: "paper",
    secondaryNavAfterItems,
    secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
    topbarOverlap: true,
  });

  const filteredNotifications = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notifications.filter((n: InboxNotificationDto) => {
      if (!matchesInboxKindFilter(n, kindFilter)) {
        return false;
      }
      if (!q) {
        return true;
      }
      const haystack = `${n.summary} ${n.kind}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [kindFilter, notifications, search]);

  const toolbarLabels = useMemo(
    () => ({
      filterAll: t("inbox.filter.all"),
      filterErrors: t("inbox.filter.errors"),
      filterHitl: t("inbox.filter.hitl"),
      filterUpdates: t("inbox.filter.updates"),
      paginationSummary: t("inbox.paginationSummary", {
        total: filteredNotifications.length,
      }),
      searchPlaceholder: t("inbox.searchPlaceholder"),
    }),
    [filteredNotifications.length, t]
  );

  return (
    <Tabs
      className="flex min-h-0 w-full flex-1 flex-col overflow-hidden"
      onValueChange={onPlanTabChange}
      value="inbox"
    >
      <DetailPageHeader
        aboveStrip={<PlanListSubNav />}
        aboveStripAlign="center"
        description={<p>{t("inbox.subtitle")}</p>}
        maxWidth="5xl"
        title={t("inbox.title")}
        variant="canvas"
      />

      <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto">
        <div className="mx-auto flex w-full max-w-5xl flex-col px-page pb-10">
          <InboxToolbar
            kindFilter={kindFilter}
            labels={toolbarLabels}
            onKindFilterChange={setKindFilter}
            onSearchChange={setSearch}
            searchQuery={search}
          />

          <div className="mt-6">
            {listQuery.isLoading ? (
              <p className="text-muted-foreground text-sm">
                {t("inbox.loading")}
              </p>
            ) : null}
            {listQuery.isError ? (
              <p className="text-destructive text-sm">
                {t("inbox.loadFailed")}
              </p>
            ) : null}
            {listQuery.isLoading || listQuery.isError ? null : (
              <InboxList
                kindFilter={kindFilter}
                locale={locale}
                notifications={filteredNotifications}
              />
            )}
          </div>
        </div>
      </div>

      {topbarDialogs}
    </Tabs>
  );
}
