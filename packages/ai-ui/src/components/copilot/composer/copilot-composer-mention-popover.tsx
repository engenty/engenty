"use client";

import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@engenty/ui-core";
import { createPortal } from "react-dom";

export function CopilotComposerMentionPopover({
  applyMentionPick,
  mentionFloatRef,
  mentionHighlight,
  mentionOpen,
  mentionRows,
  setMentionHighlight,
}: {
  applyMentionPick: (agent: {
    handle: string;
    id: string;
    name: string;
  }) => void;
  mentionFloatRef: React.RefObject<HTMLDivElement | null>;
  mentionHighlight: number;
  mentionOpen: boolean;
  mentionRows: Array<{ handle: string; id: string; name: string }>;
  setMentionHighlight: (index: number) => void;
}) {
  if (!(mentionOpen && mentionRows.length > 0)) {
    return null;
  }

  return createPortal(
    <div
      aria-label="Agents"
      className="ui-canvas-floating z-[200] w-[min(17rem,calc(100vw-1rem))] overflow-hidden rounded-md border-0 bg-popover p-0 text-popover-foreground text-xs"
      ref={mentionFloatRef}
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
        onValueChange={(id) => {
          const ix = mentionRows.findIndex((r) => r.id === id);
          if (ix >= 0) {
            setMentionHighlight(ix);
          }
        }}
        shouldFilter={false}
        tabIndex={-1}
        value={mentionRows[mentionHighlight]?.id ?? mentionRows[0]?.id ?? ""}
      >
        <CommandList className="max-h-32 overflow-y-auto py-0.5">
          <CommandGroup className="p-0">
            {mentionRows.map((c, i) => (
              <CommandItem
                className="flex min-h-0 cursor-pointer flex-col items-start gap-0 rounded-none px-2 py-1.5 text-xs"
                key={c.id}
                keywords={[c.name, c.handle, c.id]}
                onMouseEnter={() => setMentionHighlight(i)}
                onPointerDown={(ev) => ev.preventDefault()}
                onSelect={() => applyMentionPick(c)}
                value={c.id}
              >
                <span className="w-full truncate font-medium leading-tight">
                  {c.name}
                </span>
                <span className="w-full truncate font-normal text-muted-foreground text-xxs leading-tight">
                  @{c.handle}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </div>,
    document.body
  );
}
