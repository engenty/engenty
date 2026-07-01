import { useTranslation } from "@engenty/i18n/ui";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@engenty/ui-core";
import { AnimatedRefreshIcon } from "@engenty/ui-icons";
import { ExternalLink, ListTree, Tag, Trash2 } from "lucide-react";
import type { InboxItem, InboxStatus } from "../../src/schema/types.js";
import { inboxSafeSourceHref } from "../lib/inbox-source-url.js";

const STATUS_OPTIONS: InboxStatus[] = [
  "new",
  "triaged",
  "needs_review",
  "failed",
];

function inboxStatusMenuLabel(
  t: (key: string) => string,
  st: InboxStatus
): string {
  switch (st) {
    case "new":
      return t("inbox.status_new");
    case "triaged":
      return t("inbox.status_triaged");
    case "needs_review":
      return t("inbox.status_needs_review");
    case "failed":
      return t("inbox.status_failed");
    case "promoted":
      return t("inbox.status_promoted");
    case "discarded":
      return t("inbox.status_discarded");
    default:
      return st;
  }
}

export function InboxRowMenuItems({
  item,
  onOpenDetail,
  onSetStatus,
  onRequestDelete,
  onFetchFromUrl,
}: {
  item: InboxItem;
  onFetchFromUrl: () => void;
  onOpenDetail: () => void;
  onRequestDelete: () => void;
  onSetStatus: (status: InboxStatus) => void;
}) {
  const { t } = useTranslation("kb");
  const href = inboxSafeSourceHref(item.source_url);
  const editable = item.status !== "promoted" && item.status !== "discarded";

  return (
    <>
      <DropdownMenuItem
        onClick={(e) => {
          e.stopPropagation();
          onOpenDetail();
        }}
      >
        <ListTree className="mr-2 h-4 w-4" />
        {t("inbox.menu_open")}
      </DropdownMenuItem>
      {href ? (
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            window.open(href, "_blank", "noopener,noreferrer");
          }}
        >
          <ExternalLink className="mr-2 h-4 w-4" />
          {t("inbox.menu_open_source")}
        </DropdownMenuItem>
      ) : null}
      {editable ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger
              className="cursor-default"
              onClick={(e) => e.stopPropagation()}
            >
              <Tag className="mr-2 h-4 w-4" />
              {t("inbox.menu_set_status")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-48">
              {STATUS_OPTIONS.map((st) => (
                <DropdownMenuItem
                  disabled={item.status === st}
                  key={st}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSetStatus(st);
                  }}
                >
                  {inboxStatusMenuLabel(t, st)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          {item.source_url?.trim() ? (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onFetchFromUrl();
              }}
            >
              <AnimatedRefreshIcon className="mr-2" size="sm" />
              {t("inbox.fetch_from_url")}
            </DropdownMenuItem>
          ) : null}
        </>
      ) : null}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        className="text-destructive focus:text-destructive"
        onClick={(e) => {
          e.stopPropagation();
          onRequestDelete();
        }}
      >
        <Trash2 className="mr-2 h-4 w-4" />
        {t("inbox.menu_delete")}
      </DropdownMenuItem>
    </>
  );
}
