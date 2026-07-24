// Routed inbox page (/mdl/tasks/inbox) — the tenant's team inbox over Mastra
// notification records (task completions/failures, trigger errors).
import {
  type InboxNotificationDto,
  useInboxListQuery,
  useMarkAllInboxSeenMutation,
} from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { CheckCheck, Loader2 } from "lucide-react";
import { useMemo } from "react";
import { InboxList } from "../components/inbox/inbox-list.js";
import { useTasksModuleSecondaryShellNav } from "../hooks/use-tasks-module-secondary-shell-nav.js";

export function InboxPage() {
  const { t, i18n } = useTranslation("tasks");
  const listQuery = useInboxListQuery({ limit: 100 });
  const markAllMutation = useMarkAllInboxSeenMutation();

  const { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot } =
    useTasksModuleSecondaryShellNav();
  const breadcrumbs = useMemo(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: t("inbox.title") },
    ],
    [moduleRootCrumb, t]
  );
  usePageConfig({
    breadcrumbs,
    secondaryNavAfterItems,
    secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
  });

  const notifications = listQuery.data?.notifications ?? [];
  const hasUnseen = notifications.some(
    (n: InboxNotificationDto) =>
      n.status === "pending" || n.status === "delivered"
  );

  return (
    <section className="flex min-h-0 w-full flex-1 flex-col gap-6 overflow-auto p-page pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-semibold text-xl">{t("inbox.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("inbox.subtitle")}</p>
        </div>
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
      </div>

      {listQuery.isLoading ? (
        <p className="text-muted-foreground text-sm">{t("inbox.loading")}</p>
      ) : listQuery.isError ? (
        <p className="text-destructive text-sm">{t("inbox.loadFailed")}</p>
      ) : (
        <InboxList
          locale={i18n.language || "en"}
          notifications={notifications}
        />
      )}
    </section>
  );
}
