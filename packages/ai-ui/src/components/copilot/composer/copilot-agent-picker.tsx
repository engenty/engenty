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
import { ChevronDown } from "lucide-react";

export interface CopilotAgentPickerAgent {
  chat_triggers?: {
    include_in_chat_picker: boolean;
    is_active: boolean;
  };
  description?: string | null;
  id: string;
  name: string;
}

export interface CopilotAgentPickerProps {
  agents: CopilotAgentPickerAgent[];
  agentsLoading?: boolean;
  /** Shown when `selectedAgentId` is null / general copilot. */
  generalAgentId?: string;
  generalAgentLabel: string;
  onSelectAgent: (agentId: string | null) => void;
  /** Trigger when list is empty (after filters). */
  pickAgentLabel: string;
  selectedAgentId: string | null;
  variant?: "compact" | "panel";
}

function pickableAgents(
  agents: CopilotAgentPickerAgent[]
): CopilotAgentPickerAgent[] {
  return agents.filter((row) => {
    const tr = row.chat_triggers;
    if (!tr) {
      return true;
    }
    return tr.is_active && tr.include_in_chat_picker;
  });
}

export function CopilotAgentPicker({
  agents,
  agentsLoading = false,
  generalAgentId = "engenty.copilot",
  generalAgentLabel,
  onSelectAgent,
  pickAgentLabel,
  selectedAgentId,
  variant = "panel",
}: CopilotAgentPickerProps) {
  const isCompact = variant === "compact";
  const list = pickableAgents(agents);
  const effectiveId =
    selectedAgentId == null || selectedAgentId === generalAgentId
      ? null
      : selectedAgentId;
  const selected =
    effectiveId == null
      ? { id: null as string | null, name: generalAgentLabel }
      : (list.find((a) => a.id === effectiveId) ??
        agents.find((a) => a.id === effectiveId) ?? {
          id: effectiveId,
          name: effectiveId,
        });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className={
            isCompact
              ? "h-8 max-w-[min(220px,48vw)] justify-between gap-1 px-2 font-normal"
              : "h-8 max-w-[min(280px,55vw)] justify-between gap-1 px-2 font-normal"
          }
          size="sm"
          type="button"
          variant="ghost"
        >
          <span className="min-w-0 flex-1 truncate text-left text-sm">
            {agentsLoading && !selected?.name
              ? "…"
              : (selected?.name ?? pickAgentLabel)}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>{pickAgentLabel}</DropdownMenuLabel>
        <DropdownMenuItem
          className={effectiveId == null ? "bg-accent" : undefined}
          onSelect={(event) => {
            event.preventDefault();
            onSelectAgent(null);
          }}
        >
          {generalAgentLabel}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {agentsLoading && list.length === 0 ? (
          <DropdownMenuItem disabled>…</DropdownMenuItem>
        ) : null}
        {!agentsLoading && list.length === 0 ? (
          <DropdownMenuItem disabled>{pickAgentLabel}</DropdownMenuItem>
        ) : null}
        {list.map((agent) => {
          if (agent.id === generalAgentId) {
            return null;
          }
          const active = agent.id === effectiveId;
          return (
            <DropdownMenuItem
              className={active ? "bg-accent" : undefined}
              key={agent.id}
              onSelect={(event) => {
                event.preventDefault();
                onSelectAgent(agent.id);
              }}
            >
              <span className="truncate">{agent.name}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
