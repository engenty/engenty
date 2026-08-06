"use client";

import { cn } from "@engenty/ui-core";
import type { AiAdminThreadRow } from "../../lib/admin/ai-runtime-api.js";
import { ThreadStatusIcon } from "./agent-thread-list-item.js";
import { formatRelativeDate } from "./date-format.js";

interface ThreadsCatalogListItemProps {
  agentLabel: string;
  className?: string;
  isActive?: boolean;
  onSelect: () => void;
  t: (key: string) => string;
  thread: AiAdminThreadRow;
}

export function ThreadsCatalogListItem({
  agentLabel,
  className,
  isActive = false,
  onSelect,
  t,
  thread,
}: ThreadsCatalogListItemProps) {
  const primaryLabel =
    thread.title?.trim() || thread.summary?.trim() || thread.id;
  const relativeTime = formatRelativeDate(
    thread.last_message_at ?? thread.updated_at
  );
  const userShort = thread.user_id?.trim()
    ? `${thread.user_id.slice(0, 8)}…`
    : null;
  const secondaryParts = [agentLabel, userShort].filter(Boolean);
  const secondaryLabel =
    secondaryParts.length > 0
      ? secondaryParts.join(" · ")
      : t("sessions.noAgent");
  const canOpen = Boolean(thread.current_agent_id);

  return (
    <button
      className={cn(
        "flex w-full min-w-0 gap-2 px-3 py-2.5 text-left",
        canOpen
          ? isActive
            ? "font-semibold text-foreground"
            : "font-normal text-foreground"
          : "cursor-not-allowed opacity-60",
        className
      )}
      disabled={!canOpen}
      onClick={onSelect}
      title={canOpen ? primaryLabel : undefined}
      type="button"
    >
      <div className="flex shrink-0 pt-0.5">
        <ThreadStatusIcon status={thread.status} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate font-medium text-sm">
            {primaryLabel}
          </span>
          {relativeTime ? (
            <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
              {relativeTime}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-muted-foreground text-xs">
          {secondaryLabel}
        </p>
      </div>
    </button>
  );
}
