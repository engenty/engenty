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

/** One row in the copilot thread picker (server `ai.thread`). */
export interface CopilotThreadRow {
  agent_id?: string | null;
  id: string;
  last_message_at?: string | null;
  summary?: string | null;
  title?: string | null;
}

export interface CopilotThreadChooserProps {
  activeThreadId: string | null;
  composeNewLabel: string;
  emptyThreadsLabel: string;
  loading?: boolean;
  newThreadLabel: string;
  onNewThread: () => void;
  onSelectThread: (thread: CopilotThreadRow) => void;
  threads: CopilotThreadRow[];
  threadsSectionLabel: string;
  variant?: "compact" | "panel";
}

function threadPrimaryLabel(thread: CopilotThreadRow) {
  const title = thread.title?.trim();
  if (title) {
    return title;
  }
  const summary = thread.summary?.trim();
  if (summary) {
    return summary;
  }
  return thread.id.slice(0, 8);
}

/** Dropdown to pick the active copilot thread on this client (host owns list + selection). */
export function CopilotThreadChooser({
  activeThreadId,
  composeNewLabel,
  emptyThreadsLabel,
  loading = false,
  newThreadLabel,
  onNewThread,
  onSelectThread,
  threads,
  threadsSectionLabel,
  variant = "panel",
}: CopilotThreadChooserProps) {
  const isCompact = variant === "compact";
  const activeRow = activeThreadId
    ? threads.find((row) => row.id === activeThreadId)
    : null;
  const triggerLabel = activeRow
    ? threadPrimaryLabel(activeRow)
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
            {loading && !activeRow && !activeThreadId ? "…" : triggerLabel}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            onNewThread();
          }}
        >
          {newThreadLabel}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{threadsSectionLabel}</DropdownMenuLabel>
        {loading && threads.length === 0 ? (
          <DropdownMenuItem disabled>…</DropdownMenuItem>
        ) : null}
        {!loading && threads.length === 0 ? (
          <DropdownMenuItem disabled>{emptyThreadsLabel}</DropdownMenuItem>
        ) : null}
        {threads.map((thread) => {
          const stamp = thread.last_message_at ?? thread.id;
          let sub = "";
          try {
            sub = formatDistanceToNowStrict(new Date(stamp), {
              addSuffix: true,
            });
          } catch {
            sub = "";
          }
          const selected = thread.id === activeThreadId;
          return (
            <DropdownMenuItem
              className={selected ? "bg-accent" : undefined}
              key={thread.id}
              onSelect={(event) => {
                event.preventDefault();
                onSelectThread(thread);
              }}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-medium text-sm">
                  {threadPrimaryLabel(thread)}
                </span>
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
