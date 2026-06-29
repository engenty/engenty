"use client";

import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import { ChevronDown } from "lucide-react";
import type { CopilotCompactContextOption } from "./copilot-compact-launcher";

export interface CopilotContextDropdownProps {
  className?: string;
  /** Menu section title above radio options. */
  contextLabel?: string;
  onSelect: (id: string) => void;
  options: CopilotCompactContextOption[];
  /** Section title for recent entries. */
  recentLabel?: string;
  recentOptions?: CopilotCompactContextOption[];
  selectedId: string;
  /** `compact`: small trigger for composer row; `panel`: header-style trigger. */
  variant?: "compact" | "panel";
}

export function CopilotContextDropdown({
  options,
  selectedId,
  onSelect,
  recentOptions,
  contextLabel = "Context",
  recentLabel = "Recent",
  variant = "compact",
  className,
}: CopilotContextDropdownProps) {
  const selected =
    options.find((option) => option.id === selectedId) ?? options[0];

  const triggerClass =
    variant === "panel"
      ? "h-9 max-h-full max-w-full min-w-0 flex-1 justify-between gap-1 px-2 font-medium text-foreground text-sm"
      : "h-auto max-w-32 gap-0.5 px-0 font-medium text-xs bg-transparent hover:bg-transparent focus-visible:bg-transparent active:bg-transparent";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className={cn(triggerClass, className)}
          size={variant === "panel" ? "sm" : "xs"}
          type="button"
          variant="ghost"
        >
          <span className="min-w-0 truncate">
            {selected?.label ?? "Global"}
          </span>
          <ChevronDown className="size-3.5 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="z-[45] w-56">
        <DropdownMenuLabel>{contextLabel}</DropdownMenuLabel>
        <DropdownMenuRadioGroup onValueChange={onSelect} value={selectedId}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.id} value={option.id}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {recentOptions && recentOptions.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{recentLabel}</DropdownMenuLabel>
            {recentOptions.map((option) => (
              <DropdownMenuItem
                key={option.id}
                onSelect={() => onSelect(option.id)}
              >
                {option.label}
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
