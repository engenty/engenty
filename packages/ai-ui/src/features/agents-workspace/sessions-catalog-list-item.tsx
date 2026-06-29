"use client";

import { cn } from "@engenty/ui-core";
import type { AiAdminSessionRow } from "../../lib/admin/ai-runtime-api";
import { SessionStatusIcon } from "./agent-session-list-item";
import { formatRelativeDate } from "./date-format";

interface SessionsCatalogListItemProps {
  agentLabel: string;
  className?: string;
  isActive?: boolean;
  onSelect: () => void;
  session: AiAdminSessionRow;
  t: (key: string) => string;
}

export function SessionsCatalogListItem({
  agentLabel,
  className,
  isActive = false,
  onSelect,
  session,
  t,
}: SessionsCatalogListItemProps) {
  const primaryLabel =
    session.title?.trim() || session.summary?.trim() || session.id;
  const relativeTime = formatRelativeDate(
    session.last_message_at ?? session.updated_at
  );
  const userShort = session.user_id?.trim()
    ? `${session.user_id.slice(0, 8)}…`
    : null;
  const secondaryParts = [agentLabel, userShort].filter(Boolean);
  const secondaryLabel =
    secondaryParts.length > 0
      ? secondaryParts.join(" · ")
      : t("sessions.noAgent");
  const canOpen = Boolean(session.current_agent_id);

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
        <SessionStatusIcon status={session.status} />
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
