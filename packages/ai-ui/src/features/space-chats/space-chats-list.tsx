"use client";

import { Button, cn, Engenty } from "@engenty/ui-core";
import { Lock } from "lucide-react";
import { Link } from "react-router-dom";
import { ChatKindBadge } from "../../components/copilot/chat-kind-badge.js";
import type {
  SpaceChatKind,
  SpaceChatKindGroup,
  SpaceChatRow,
} from "./space-chats-model.js";

export interface SpaceChatsListLabels {
  emptyDescription: string;
  emptyTitle: string;
  /** The button on a room the viewer is not in. */
  join: string;
  joining: string;
  /** One line under the heading saying what this kind is. */
  kindHint: Record<SpaceChatKind, string>;
  kindTitle: Record<SpaceChatKind, string>;
  loadFailed: string;
  untitled: string;
}

function ChatRow({
  href,
  isActive,
  label,
  onJoin,
  labels,
  row,
  withBlob,
}: {
  href: string;
  isActive: boolean;
  label: string;
  labels: SpaceChatsListLabels;
  onJoin?: (row: SpaceChatRow) => void;
  row: SpaceChatRow;
  /** Rooms and DMs carry their agent on the row; desks have it as heading. */
  withBlob: boolean;
}) {
  const body = (
    <>
      {withBlob ? (
        <span aria-hidden className="flex shrink-0 items-center">
          {row.memberAgentIds.slice(0, 3).map((agentId, index) => (
            <span
              className={cn(
                "grid place-items-center rounded-full bg-background",
                index > 0 && "-ml-2"
              )}
              key={agentId}
              style={{ zIndex: 3 - index }}
            >
              <Engenty
                className="[&_.e-shadow]:hidden"
                kind={agentId === row.agentId ? row.engenty : "round"}
                size={20}
              />
            </span>
          ))}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate" title={label}>
        {label}
      </span>
      {/* The kind, as the same glyph the chat header wears — the heading says
          it once, the row says it where the eye lands. */}
      <ChatKindBadge
        iconOnly
        kind={row.kind}
        memberCount={row.memberAgentIds.length}
        name={row.agentName}
      />
      {row.visibility === "private" && row.kind !== "dm" ? (
        <Lock aria-hidden className="size-3 shrink-0 text-muted-foreground" />
      ) : null}
      {/* A run in flight is the one status worth a mark in a list this dense:
          it is the only one that changes on its own while you look at it. */}
      {row.status === "running" || row.status === "waiting" ? (
        <span
          aria-hidden
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            row.status === "running" ? "bg-primary" : "bg-amber-500"
          )}
        />
      ) : null}
    </>
  );
  const className = cn(
    "flex min-w-0 items-center gap-2 rounded-[8px] px-2 py-1.5 text-sm transition",
    isActive
      ? "bg-muted font-semibold text-foreground"
      : "text-foreground hover:bg-muted/60"
  );
  if (!row.joined) {
    // Not yours yet: the row is not a link. Joining makes it one.
    return (
      <div className={className} data-testid="space-chat-row-unjoined">
        {body}
        <Button
          onClick={() => onJoin?.(row)}
          size="sm"
          type="button"
          variant="outline"
        >
          {labels.join}
        </Button>
      </div>
    );
  }
  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={className}
      to={href}
    >
      {body}
    </Link>
  );
}

/**
 * A space's conversations by kind: rooms (with a way in), the agents' desks,
 * your direct messages.
 *
 * The kind heading is not a filter chip — it is a statement, and it carries
 * its own one-line explanation, because "Rooms" means nothing to someone who
 * has never been told the difference between a desk and a room.
 */
export function SpaceChatsList({
  activeThreadId,
  error,
  groups,
  isLoading,
  labels,
  onJoin,
  resolveHref,
}: {
  activeThreadId?: string | null;
  error?: Error | null;
  groups: SpaceChatKindGroup[];
  isLoading?: boolean;
  labels: SpaceChatsListLabels;
  onJoin?: (row: SpaceChatRow) => void;
  resolveHref: (row: SpaceChatRow) => string;
}) {
  if (error) {
    return (
      <p className="px-2 py-4 text-destructive text-sm">{labels.loadFailed}</p>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-1 px-2 py-2">
        {[0, 1, 2].map((index) => (
          <div
            className="h-7 animate-pulse rounded-[8px] bg-muted"
            key={index}
          />
        ))}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="px-2 py-8 text-center">
        <p className="font-medium text-sm">{labels.emptyTitle}</p>
        <p className="mt-1 text-muted-foreground text-sm">
          {labels.emptyDescription}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <section data-testid={`space-chats-${group.kind}`} key={group.kind}>
          <h2 className="font-semibold text-sm">
            {labels.kindTitle[group.kind]}
          </h2>
          <p className="mt-0.5 mb-2 text-muted-foreground text-xs">
            {labels.kindHint[group.kind]}
          </p>
          {group.kind === "desk" ? (
            <div className="flex flex-col gap-4">
              {group.agents.map((agent) => (
                <div key={agent.agentId}>
                  <div className="mb-1 flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden
                      className="grid size-6 shrink-0 place-items-center overflow-visible"
                    >
                      <Engenty
                        className="[&_.e-shadow]:hidden"
                        kind={agent.engenty}
                        size={22}
                      />
                    </span>
                    <span
                      className="min-w-0 truncate font-medium text-muted-foreground text-xs uppercase tracking-wide"
                      title={agent.agentName}
                    >
                      {agent.agentName}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    {agent.rows.map((row) => (
                      <ChatRow
                        href={resolveHref(row)}
                        isActive={row.id === activeThreadId}
                        key={row.id}
                        label={row.title ?? labels.untitled}
                        labels={labels}
                        row={row}
                        withBlob={false}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col">
              {group.rows.map((row) => (
                <ChatRow
                  href={resolveHref(row)}
                  isActive={row.id === activeThreadId}
                  key={row.id}
                  label={
                    row.kind === "dm"
                      ? row.agentName
                      : (row.title ?? labels.untitled)
                  }
                  labels={labels}
                  onJoin={onJoin}
                  row={row}
                  withBlob
                />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
