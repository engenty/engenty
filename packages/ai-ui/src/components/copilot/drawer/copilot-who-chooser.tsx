"use client";

import type { CopilotCompanionWho } from "@engenty/app-shell";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import { ChevronDown } from "lucide-react";
import { AgentFace } from "../../agent-face.js";
import {
  COPILOT_WHO_ID,
  type CopilotWhoOption,
} from "./copilot-fab-trigger.js";

export function companionWhoFromOptionId(id: string): CopilotCompanionWho {
  return id === COPILOT_WHO_ID
    ? { kind: "copilot" }
    : { kind: "engenty", agentId: id };
}

export function companionWhoOptionId(who: CopilotCompanionWho): string {
  return who.kind === "engenty" ? who.agentId : COPILOT_WHO_ID;
}

export function CopilotWhoChooser({
  label = "Choose Engenty",
  onSelect,
  options,
  selectedId,
}: {
  label?: string;
  onSelect: (id: string) => void;
  options: CopilotWhoOption[];
  selectedId: string;
}) {
  const selected =
    options.find((option) => option.id === selectedId) ?? options[0];

  if (!selected) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={label}
          className="h-8 max-w-[min(220px,48vw)] gap-1.5 px-1.5 font-normal"
          size="sm"
          type="button"
          variant="ghost"
        >
          <AgentFace
            avatarUrl={selected.avatarUrl}
            className="[&_.e-shadow]:hidden"
            kind={selected.engenty}
            name={selected.name}
            size={22}
          />
          <span className="min-w-0 flex-1 truncate text-left text-sm">
            {selected.name}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {options.map((option) => (
          <DropdownMenuItem
            className="gap-2"
            key={option.id}
            onSelect={() => onSelect(option.id)}
          >
            <AgentFace
              animated={option.id === selected.id}
              avatarUrl={option.avatarUrl}
              className="[&_.e-shadow]:hidden"
              kind={option.engenty}
              name={option.name}
              size={22}
            />
            <span className="truncate">{option.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
