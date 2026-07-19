// Single activity feed row: agent, title, status dot, relative time.

import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { Bot, CircleAlert, CircleCheckBig, CircleDot } from "lucide-react";
import { formatRelativeDate } from "../agents-workspace/date-format";
import type { ActivityEntry } from "./activity-entries";

interface ActivityFeedItemProps {
  agentName: string | null;
  entry: ActivityEntry;
  onSelect: (entry: ActivityEntry) => void;
  t: (key: string) => string;
}

export function ActivityStatusDot({ entry }: { entry: ActivityEntry }) {
  switch (entry.statusKind) {
    case "running":
      return (
        <AnimatedLoaderIcon
          className="text-amber-600 dark:text-amber-300"
          play="always"
          size="xs"
        />
      );
    case "failed":
      return <CircleAlert className="h-3.5 w-3.5 text-destructive" />;
    case "finished":
      return (
        <CircleCheckBig className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-300" />
      );
    default:
      return <CircleDot className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

function entryTitle(entry: ActivityEntry, t: (key: string) => string) {
  return entry.title ?? t("activity.untitledSession");
}

export function ActivityFeedItem({
  agentName,
  entry,
  onSelect,
  t,
}: ActivityFeedItemProps) {
  const relativeTime = formatRelativeDate(entry.timestamp);

  return (
    <button
      className="flex w-full items-center gap-2 border-b px-3 py-2.5 text-left transition last:border-b-0 hover:bg-accent/20"
      onClick={() => onSelect(entry)}
      type="button"
    >
      <ActivityStatusDot entry={entry} />
      <span className="flex min-w-0 shrink-0 items-center gap-1.5 sm:w-44">
        <Bot className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate text-muted-foreground text-xs">
          {agentName ?? entry.agentId ?? t("activity.noAgent")}
        </span>
      </span>
      <span className="min-w-0 flex-1 truncate text-foreground text-sm">
        {entryTitle(entry, t)}
      </span>
      <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
        {relativeTime ?? entry.timestamp}
      </span>
    </button>
  );
}
