"use client";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import { formatDistanceToNowStrict } from "date-fns";
import { ChevronDown } from "lucide-react";

export interface CopilotAgentThreadChooserThread {
  current_agent_id: string | null;
  id: string;
  last_message_at: string | null;
  status: string;
  summary: string | null;
  title: string | null;
}

export interface CopilotAgentThreadChooserProps {
  agents: Array<{ description?: string | null; id: string; name: string }>;
  agentsLoading?: boolean;
  emptyThreadsLabel: string;
  menuAgentId: string | null;
  menuThreads: CopilotAgentThreadChooserThread[];
  menuThreadsLoading?: boolean;
  newThreadLabel: string;
  onNewThreadForAgent: (agentId: string) => void;
  onRequestAgentThreads: (agentId: string | null) => void;
  onResumeThread: (thread: CopilotAgentThreadChooserThread) => void;
  onSelectAgent: (agentId: string) => void;
  selectAgentLabel: string;
  selectedAgentId: string | null;
  threadsSectionLabel: string;
  variant?: "compact" | "panel";
}

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

export function CopilotAgentThreadChooser({
  agents,
  agentsLoading = false,
  emptyThreadsLabel,
  menuAgentId,
  menuThreads,
  menuThreadsLoading = false,
  newThreadLabel,
  onNewThreadForAgent,
  onRequestAgentThreads,
  onResumeThread,
  onSelectAgent,
  selectAgentLabel,
  selectedAgentId,
  threadsSectionLabel,
  variant = "panel",
}: CopilotAgentThreadChooserProps) {
  const selected = agents.find((agent) => agent.id === selectedAgentId);
  const triggerLabel =
    selected?.name ?? (selectedAgentId ? selectedAgentId : selectAgentLabel);
  const isCompact = variant === "compact";

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
            {agentsLoading && !selected ? "…" : triggerLabel}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        {agentsLoading && agents.length === 0 ? (
          <DropdownMenuItem disabled>…</DropdownMenuItem>
        ) : null}
        {agents.map((agent) => (
          <DropdownMenuSub
            key={agent.id}
            onOpenChange={(open) => {
              if (open) {
                onSelectAgent(agent.id);
                onRequestAgentThreads(agent.id);
              } else if (menuAgentId === agent.id) {
                onRequestAgentThreads(null);
              }
            }}
          >
            <DropdownMenuSubTrigger className="cursor-default">
              <span className="min-w-0 flex-1 truncate">{agent.name}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-64">
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  onSelectAgent(agent.id);
                  onNewThreadForAgent(agent.id);
                }}
              >
                {newThreadLabel}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{threadsSectionLabel}</DropdownMenuLabel>
              {menuAgentId === agent.id && menuThreadsLoading ? (
                <DropdownMenuItem disabled>…</DropdownMenuItem>
              ) : null}
              {menuAgentId === agent.id &&
              !menuThreadsLoading &&
              menuThreads.length === 0 ? (
                <DropdownMenuItem disabled>
                  {emptyThreadsLabel}
                </DropdownMenuItem>
              ) : null}
              {menuAgentId === agent.id
                ? menuThreads.map((thread) => (
                    <DropdownMenuItem
                      key={thread.id}
                      onSelect={() => {
                        onResumeThread(thread);
                      }}
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate">
                          {threadPrimaryLabel(thread)}
                        </span>
                        {thread.last_message_at ? (
                          <span className="text-muted-foreground text-xs">
                            {formatDistanceToNowStrict(
                              new Date(thread.last_message_at),
                              { addSuffix: true }
                            )}
                          </span>
                        ) : null}
                      </div>
                    </DropdownMenuItem>
                  ))
                : null}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
