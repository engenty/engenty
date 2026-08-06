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
import type { CopilotAgentThreadChooserThread } from "./copilot-agent-thread-chooser.js";

function threadPrimaryLabel(thread: CopilotAgentThreadChooserThread) {
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

export interface CopilotRecentThreadsChooserProps {
  activeThreadId: string | null;
  composeNewLabel: string;
  emptyThreadsLabel: string;
  newThreadLabel: string;
  onNewThread: () => void;
  onResumeThread: (thread: CopilotAgentThreadChooserThread) => void;
  threads: CopilotAgentThreadChooserThread[];
  threadsLoading?: boolean;
  threadsSectionLabel: string;
  variant?: "compact" | "panel";
}

export function CopilotRecentThreadsChooser({
  activeThreadId,
  composeNewLabel,
  emptyThreadsLabel,
  newThreadLabel,
  onNewThread,
  onResumeThread,
  threads,
  threadsLoading = false,
  threadsSectionLabel,
  variant = "panel",
}: CopilotRecentThreadsChooserProps) {
  const isCompact = variant === "compact";
  const activeRow = activeThreadId
    ? threads.find((s) => s.id === activeThreadId)
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
            {threadsLoading && !activeRow && !activeThreadId
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
            onNewThread();
          }}
        >
          {newThreadLabel}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{threadsSectionLabel}</DropdownMenuLabel>
        {threadsLoading && threads.length === 0 ? (
          <DropdownMenuItem disabled>…</DropdownMenuItem>
        ) : null}
        {!threadsLoading && threads.length === 0 ? (
          <DropdownMenuItem disabled>{emptyThreadsLabel}</DropdownMenuItem>
        ) : null}
        {threads.map((thread) => {
          const label = threadPrimaryLabel(thread);
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
                onResumeThread(thread);
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
