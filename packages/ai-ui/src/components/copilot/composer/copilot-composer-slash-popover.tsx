"use client";

import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@engenty/ui-core";
import { createPortal } from "react-dom";
import type { ChatSlashCommand } from "./copilot-slash-command";
import { groupSlashCommands } from "./copilot-slash-command";

/**
 * Caret-anchored slash-command menu (cmdk, portal). Mirrors the mention
 * popover: highlight is driven externally, positioning via the float ref.
 */
export function CopilotComposerSlashPopover({
  applySlashPick,
  slashFloatRef,
  slashHighlight,
  slashOpen,
  slashRows,
  setSlashHighlight,
}: {
  applySlashPick: (command: ChatSlashCommand) => void;
  slashFloatRef: React.RefObject<HTMLDivElement | null>;
  slashHighlight: number;
  slashOpen: boolean;
  slashRows: ChatSlashCommand[];
  setSlashHighlight: (index: number) => void;
}) {
  if (!(slashOpen && slashRows.length > 0)) {
    return null;
  }

  const grouped = groupSlashCommands(slashRows);
  const highlighted = slashRows[slashHighlight] ?? slashRows[0];

  return createPortal(
    <div
      aria-label="Commands"
      className="ui-canvas-floating z-[200] w-[min(20rem,calc(100vw-1rem))] overflow-hidden rounded-md border-0 bg-popover p-0 text-popover-foreground text-xs"
      ref={slashFloatRef}
      role="region"
      style={{
        left: 0,
        position: "fixed",
        top: 0,
        visibility: "hidden",
      }}
    >
      <Command
        className="bg-transparent"
        onValueChange={(command) => {
          const ix = slashRows.findIndex((r) => r.command === command);
          if (ix >= 0) {
            setSlashHighlight(ix);
          }
        }}
        shouldFilter={false}
        tabIndex={-1}
        value={highlighted?.command ?? ""}
      >
        <CommandList className="max-h-56 overflow-y-auto py-0.5">
          {grouped.map(({ group, commands }) => (
            <CommandGroup
              className="p-0 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-1.5 [&_[cmdk-group-heading]]:pb-0.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
              heading={group || undefined}
              key={group || "__ungrouped"}
            >
              {commands.map((c) => {
                const rowIndex = slashRows.findIndex(
                  (r) => r.command === c.command
                );
                return (
                  <CommandItem
                    className="flex min-h-0 cursor-pointer items-baseline gap-2 rounded-none px-2 py-1.5 text-xs"
                    key={c.command}
                    keywords={[c.command, c.label ?? "", c.description ?? ""]}
                    onMouseEnter={() => setSlashHighlight(rowIndex)}
                    onPointerDown={(ev) => ev.preventDefault()}
                    onSelect={() => applySlashPick(c)}
                    value={c.command}
                  >
                    <span className="shrink-0 font-medium font-mono leading-tight">
                      /{c.command}
                    </span>
                    {c.kind === "skill" ? (
                      <span className="shrink-0 text-muted-foreground/70 text-xxs leading-tight">
                        skill
                      </span>
                    ) : null}
                    {c.argsHint ? (
                      <span className="shrink-0 font-mono text-muted-foreground/70 text-xxs leading-tight">
                        {c.argsHint}
                      </span>
                    ) : null}
                    <span className="min-w-0 flex-1 truncate text-right font-normal text-muted-foreground text-xxs leading-tight">
                      {c.description ?? c.label ?? ""}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </div>,
    document.body
  );
}
