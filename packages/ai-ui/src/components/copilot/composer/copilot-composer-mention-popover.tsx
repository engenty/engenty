"use client";

import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@engenty/ui-core";
import { Bot, Box, User } from "lucide-react";
import { createPortal } from "react-dom";
import { type MentionRow, mentionRowKey } from "./use-copilot-composer-mention";

/** Section label for the agents group; ref rows carry their own group names. */
const AGENTS_GROUP = "Agents";

/**
 * The row's leading glyph. A supplier that knows what the row is hands one in
 * — the Space picker draws each agent as its own Engenty — and everything
 * else falls back on its entity. Without a glyph the list is one column of
 * identical text, and a room reads like an agent.
 */
function MentionRowIcon({ row }: { row: MentionRow }) {
  if (row.kind === "agent") {
    return <Bot className="size-3.5 shrink-0 text-muted-foreground" />;
  }
  const Icon =
    row.candidate.icon ??
    (row.candidate.entity === "core:user"
      ? User
      : row.candidate.entity === "ai:agent"
        ? Bot
        : Box);
  return <Icon className="size-3.5 shrink-0 text-muted-foreground" />;
}

function groupMentionRows(
  rows: MentionRow[]
): Array<{ group: string; rows: MentionRow[] }> {
  const groups = new Map<string, MentionRow[]>();
  for (const row of rows) {
    const group = row.kind === "agent" ? AGENTS_GROUP : row.candidate.group;
    const bucket = groups.get(group);
    if (bucket) {
      bucket.push(row);
    } else {
      groups.set(group, [row]);
    }
  }
  return [...groups.entries()].map(([group, grouped]) => ({
    group,
    rows: grouped,
  }));
}

export function CopilotComposerMentionPopover({
  applyMentionPick,
  mentionFloatRef,
  mentionHighlight,
  mentionOpen,
  mentionRows,
  setMentionHighlight,
}: {
  applyMentionPick: (row: MentionRow) => void;
  mentionFloatRef: React.RefObject<HTMLDivElement | null>;
  mentionHighlight: number;
  mentionOpen: boolean;
  mentionRows: MentionRow[];
  setMentionHighlight: (index: number) => void;
}) {
  if (!(mentionOpen && mentionRows.length > 0)) {
    return null;
  }

  const grouped = groupMentionRows(mentionRows);
  const highlightedKey = mentionRowKey(
    mentionRows[mentionHighlight] ?? mentionRows[0]!
  );
  // A single-namespace (agents-only) list keeps the flat look without a heading.
  const showHeadings =
    grouped.length > 1 || (grouped[0] && grouped[0].group !== AGENTS_GROUP);

  return createPortal(
    <div
      aria-label="Mentions"
      className="ui-canvas-floating z-[200] w-[min(19rem,calc(100vw-1rem))] overflow-hidden rounded-md border-0 bg-popover p-0 text-popover-foreground text-xs"
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
        onValueChange={(key) => {
          const ix = mentionRows.findIndex((r) => mentionRowKey(r) === key);
          if (ix >= 0) {
            setMentionHighlight(ix);
          }
        }}
        shouldFilter={false}
        tabIndex={-1}
        value={highlightedKey}
      >
        <CommandList className="max-h-56 overflow-y-auto py-0.5">
          {grouped.map(({ group, rows }) => (
            <CommandGroup
              className="p-0 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-1.5 [&_[cmdk-group-heading]]:pb-0.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
              heading={showHeadings ? group : undefined}
              key={group}
            >
              {rows.map((row) => {
                const key = mentionRowKey(row);
                const rowIndex = mentionRows.findIndex(
                  (r) => mentionRowKey(r) === key
                );
                const title =
                  row.kind === "agent" ? row.agent.name : row.candidate.label;
                const subtitle =
                  row.kind === "agent"
                    ? `@${row.agent.handle}`
                    : row.candidate.sublabel;
                const keywords =
                  row.kind === "agent"
                    ? [row.agent.name, row.agent.handle, row.agent.id]
                    : [row.candidate.label, row.candidate.ref];
                return (
                  <CommandItem
                    className="flex min-h-0 cursor-pointer flex-row items-center gap-2 rounded-none px-2 py-1.5 text-xs"
                    key={key}
                    keywords={keywords}
                    onMouseEnter={() => setMentionHighlight(rowIndex)}
                    onPointerDown={(ev) => ev.preventDefault()}
                    onSelect={() => applyMentionPick(row)}
                    value={key}
                  >
                    <span className="grid size-5 shrink-0 place-items-center">
                      <MentionRowIcon row={row} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="w-full truncate font-medium leading-tight">
                        {title}
                      </span>
                      {subtitle ? (
                        <span className="w-full truncate font-normal text-muted-foreground text-xxs leading-tight">
                          {subtitle}
                        </span>
                      ) : null}
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
