"use client";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import { formatDistanceToNowStrict } from "date-fns";
import { ChevronDown } from "lucide-react";
import type { CopilotAgentSessionChooserSession } from "./copilot-agent-session-chooser";

function sessionPrimaryLabel(session: CopilotAgentSessionChooserSession) {
  const title = session.title?.trim();
  if (title) {
    return title;
  }
  const summary = session.summary?.trim();
  if (summary) {
    return summary;
  }
  return session.id.slice(0, 8);
}

export interface CopilotRecentSessionsChooserProps {
  activeThreadId: string | null;
  composeNewLabel: string;
  emptySessionsLabel: string;
  newSessionLabel: string;
  onNewSession: () => void;
  onResumeSession: (session: CopilotAgentSessionChooserSession) => void;
  sessions: CopilotAgentSessionChooserSession[];
  sessionsLoading?: boolean;
  sessionsSectionLabel: string;
  variant?: "compact" | "panel";
}

export function CopilotRecentSessionsChooser({
  activeThreadId,
  composeNewLabel,
  emptySessionsLabel,
  newSessionLabel,
  onNewSession,
  onResumeSession,
  sessions,
  sessionsLoading = false,
  sessionsSectionLabel,
  variant = "panel",
}: CopilotRecentSessionsChooserProps) {
  const isCompact = variant === "compact";
  const activeRow = activeThreadId
    ? sessions.find((s) => s.id === activeThreadId)
    : null;
  const triggerLabel = activeRow
    ? sessionPrimaryLabel(activeRow)
    : composeNewLabel;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className={
            isCompact
              ? "h-8 max-w-[min(200px,42vw)] justify-between gap-1 px-2 font-normal"
              : "h-8 max-w-[min(280px,55vw)] justify-between gap-1 px-2 font-normal"
          }
          size="sm"
          type="button"
          variant="ghost"
        >
          <span className="min-w-0 flex-1 truncate text-left text-sm">
            {sessionsLoading && !activeRow && !activeThreadId
              ? "…"
              : triggerLabel}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            onNewSession();
          }}
        >
          {newSessionLabel}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{sessionsSectionLabel}</DropdownMenuLabel>
        {sessionsLoading && sessions.length === 0 ? (
          <DropdownMenuItem disabled>…</DropdownMenuItem>
        ) : null}
        {!sessionsLoading && sessions.length === 0 ? (
          <DropdownMenuItem disabled>{emptySessionsLabel}</DropdownMenuItem>
        ) : null}
        {sessions.map((session) => {
          const label = sessionPrimaryLabel(session);
          const stamp = session.last_message_at ?? session.id;
          let sub = "";
          try {
            sub = formatDistanceToNowStrict(new Date(stamp), {
              addSuffix: true,
            });
          } catch {
            sub = "";
          }
          const selected = session.id === activeThreadId;
          return (
            <DropdownMenuItem
              className={selected ? "bg-accent" : undefined}
              key={session.id}
              onSelect={(event) => {
                event.preventDefault();
                onResumeSession(session);
              }}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-medium text-sm">{label}</span>
                {sub ? (
                  <span className="truncate text-muted-foreground text-xs">
                    {sub}
                  </span>
                ) : null}
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
