import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  Button,
  DetailPageHeader,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@engenty/ui-core";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import type { InboxThreadDetail } from "../api.js";
import { formatInboxRelativeTime } from "../lib/format-relative-time.js";
import { INBOX_STATUS_BADGE_VARIANT } from "../lib/inbox-status-badge.js";
import { useInboxThreadDigestQuery } from "../queries.js";
import { CategoryTag } from "./category-tag.js";
import { ListPaneCloseIcon, ListPaneOpenIcon } from "./list-pane-icons.js";

/** How many participants fit the header line before they collapse to "+N". */
const PARTICIPANTS_SHOWN = 4;

export type ThreadViewMode = "optimized" | "original";

/**
 * Chrome the header renders but the list page owns: the thread's place in the
 * current list, and whether the list pane is showing at all.
 */
export interface ThreadNavControls {
  canNext: boolean;
  canPrevious: boolean;
  listCollapsed: boolean;
  /** Mobile only — the detail pane covers the screen, so it needs a way out. */
  onBack: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onToggleList: () => void;
  /** "12 / 569", or null while the position is unknown (search, stale list). */
  position: string | null;
}

/**
 * The thread's page header, on the shared `DetailPageHeader` so a mail thread
 * reads like every other detail page. Entity actions live in the shell topbar
 * (`usePageConfig({ actions })`) as on every other screen; the tab strip below
 * the title carries everything scoped to *this* pane — the list toggle, the
 * section tabs, moving through the list, and actions on the selected view.
 */
export function ThreadDetailHeader({
  detail,
  nav,
  onSelectViewMode,
  showConversationTab,
  tabActions,
  viewMode,
}: {
  detail: InboxThreadDetail;
  nav: ThreadNavControls;
  onSelectViewMode: (mode: ThreadViewMode) => void;
  /** False for one-way mail (notifications, newsletters) — nothing to converse with. */
  showConversationTab: boolean;
  tabActions?: ReactNode;
  viewMode: ThreadViewMode;
}) {
  const { t, i18n } = useTranslation("inbox");
  // Read-only: the optimized view is what generates a digest. Disabled here so
  // the Original tab never triggers one, while a cached category still shows.
  const digest = useInboxThreadDigestQuery(detail.thread.id, false).data;
  const latest = detail.messages.at(-1);
  const participants = detail.thread.participants;
  const shown = participants.slice(0, PARTICIPANTS_SHOWN);
  const hidden = participants.length - shown.length;

  return (
    <DetailPageHeader
      belowStrip={
        <div className="flex w-full items-end justify-between gap-3">
          <div className="flex items-end">
            <div className="pb-1">
              <Button
                // The list is what it moves, so it wears the list's own icon,
                // with the chevron showing which way. Only next to the list —
                // on mobile the thread is the whole screen.
                className="mr-1 hidden md:inline-flex"
                onClick={nav.onToggleList}
                size="icon-sm"
                title={
                  nav.listCollapsed
                    ? t("thread.showList")
                    : t("thread.hideList")
                }
                variant="ghost"
              >
                {nav.listCollapsed ? (
                  <ListPaneOpenIcon className="size-4" />
                ) : (
                  <ListPaneCloseIcon className="size-4" />
                )}
              </Button>
            </div>
            {/* Line tabs, as on every other detail page (contacts, team). */}
            <Tabs
              onValueChange={(value) =>
                onSelectViewMode(value as ThreadViewMode)
              }
              value={viewMode}
            >
              <TabsList
                className="-mb-px h-auto w-fit border-0 bg-transparent p-0"
                variant="line"
              >
                {showConversationTab ? (
                  <TabsTrigger value="optimized">
                    {t("thread.viewOptimized")}
                  </TabsTrigger>
                ) : null}
                <TabsTrigger value="original">
                  {t("thread.viewOriginal")}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="flex shrink-0 items-center gap-0.5 pb-1">
            <Button
              disabled={!nav.canPrevious}
              onClick={nav.onPrevious}
              size="icon-sm"
              title={t("thread.previousThread")}
              variant="ghost"
            >
              <ChevronLeft className="size-4" />
            </Button>
            {nav.position ? (
              <span className="px-0.5 text-muted-foreground text-xs tabular-nums">
                {nav.position}
              </span>
            ) : null}
            <Button
              disabled={!nav.canNext}
              onClick={nav.onNext}
              size="icon-sm"
              title={t("thread.nextThread")}
              variant="ghost"
            >
              <ChevronRight className="size-4" />
            </Button>
            {tabActions ? (
              <>
                <span aria-hidden className="mx-1 h-4 w-px bg-border" />
                {tabActions}
              </>
            ) : null}
          </div>
        </div>
      }
      // The topbar sits above in normal flow now, so the title needs a plain
      // top gutter rather than `blended`'s pt-14 overlap clearance.
      containerClassName="px-4 pt-3 pb-0 sm:px-4"
      description={
        <p className="truncate text-muted-foreground text-xs">
          {shown.join(", ")}
          {hidden > 0 ? ` +${hidden}` : ""}
          {detail.thread.last_message_at
            ? ` · ${formatInboxRelativeTime(detail.thread.last_message_at, i18n.language)}`
            : ""}
        </p>
      }
      maxWidth="8xl"
      status={
        <div className="flex items-center gap-1.5">
          {digest ? <CategoryTag category={digest.category} /> : null}
          {latest?.status ? (
            <Badge variant={INBOX_STATUS_BADGE_VARIANT[latest.status]}>
              {t(`lanes.${latest.status}`)}
            </Badge>
          ) : null}
        </div>
      }
      title={detail.thread.subject ?? t("list.noSubject")}
      titleClassName="line-clamp-2"
    />
  );
}
