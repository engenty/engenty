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

export interface CopilotAgentSessionChooserSession {
  current_agent_id: string | null;
  id: string;
  last_message_at: string | null;
  status: string;
  summary: string | null;
  title: string | null;
}

export interface CopilotAgentSessionChooserProps {
  agents: Array<{ description?: string | null; id: string; name: string }>;
  agentsLoading?: boolean;
  emptySessionsLabel: string;
  menuAgentId: string | null;
  menuSessions: CopilotAgentSessionChooserSession[];
  menuSessionsLoading?: boolean;
  newSessionLabel: string;
  onNewSessionForAgent: (agentId: string) => void;
  onRequestAgentSessions: (agentId: string | null) => void;
  onResumeSession: (session: CopilotAgentSessionChooserSession) => void;
  onSelectAgent: (agentId: string) => void;
  selectAgentLabel: string;
  selectedAgentId: string | null;
  sessionsSectionLabel: string;
  variant?: "compact" | "panel";
}

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

export function CopilotAgentSessionChooser({
  agents,
  agentsLoading = false,
  emptySessionsLabel,
  menuAgentId,
  menuSessions,
  menuSessionsLoading = false,
  newSessionLabel,
  onNewSessionForAgent,
  onRequestAgentSessions,
  onResumeSession,
  onSelectAgent,
  selectAgentLabel,
  selectedAgentId,
  sessionsSectionLabel,
  variant = "panel",
}: CopilotAgentSessionChooserProps) {
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
                onRequestAgentSessions(agent.id);
              } else if (menuAgentId === agent.id) {
                onRequestAgentSessions(null);
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
                  onNewSessionForAgent(agent.id);
                }}
              >
                {newSessionLabel}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{sessionsSectionLabel}</DropdownMenuLabel>
              {menuAgentId === agent.id && menuSessionsLoading ? (
                <DropdownMenuItem disabled>…</DropdownMenuItem>
              ) : null}
              {menuAgentId === agent.id &&
              !menuSessionsLoading &&
              menuSessions.length === 0 ? (
                <DropdownMenuItem disabled>
                  {emptySessionsLabel}
                </DropdownMenuItem>
              ) : null}
              {menuAgentId === agent.id
                ? menuSessions.map((session) => (
                    <DropdownMenuItem
                      key={session.id}
                      onSelect={() => {
                        onResumeSession(session);
                      }}
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate">
                          {sessionPrimaryLabel(session)}
                        </span>
                        {session.last_message_at ? (
                          <span className="text-muted-foreground text-xs">
                            {formatDistanceToNowStrict(
                              new Date(session.last_message_at),
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
