"use client";

import type { ObjectDisplayItem, ObjectWidgetCardProps } from "@engenty/ai-ui";
import { Avatar, AvatarFallback, cn, Skeleton } from "@engenty/ui-core";
import { Link } from "react-router-dom";
import { useTeamMemberDetailQuery } from "../../queries.js";

/** Chat object widget for `team:member:<id>` refs — live data, viewer authz. */

const LIST_INLINE_LIMIT = 10;

function memberInitials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

function TeamMemberRow({
  memberId,
  snapshot,
}: {
  memberId: string;
  snapshot?: ObjectDisplayItem;
}) {
  const {
    data: member,
    isPending,
    isError,
  } = useTeamMemberDetailQuery(memberId);

  if (isPending && !snapshot) {
    return (
      <div className="flex items-center gap-2.5 px-3 py-2">
        <Skeleton className="size-7 rounded-full" />
        <div className="flex-1 space-y-1">
          <Skeleton className="h-3.5 w-40" />
        </div>
      </div>
    );
  }

  const name = member?.full_name ?? snapshot?.title ?? memberId;
  const secondary =
    [member?.department, member?.location_term ?? member?.location]
      .filter(Boolean)
      .join(" · ") ||
    member?.email ||
    snapshot?.subtitle;

  return (
    <Link
      className="flex items-center gap-2.5 px-3 py-2 transition-colors hover:bg-muted/50"
      to={`/mdl/team/${memberId}`}
    >
      <Avatar className="size-7">
        <AvatarFallback className="text-[10px]">
          {member?.initials ?? memberInitials(name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-foreground/90 text-sm">
          {name}
        </div>
        {secondary ? (
          <div className="truncate text-muted-foreground text-xs">
            {secondary}
          </div>
        ) : null}
      </div>
      {isError && !member ? (
        <span className="shrink-0 text-muted-foreground/70 text-xs">
          not available
        </span>
      ) : null}
    </Link>
  );
}

export function TeamMemberObjectCard({
  refs,
  items,
  provenance,
}: ObjectWidgetCardProps) {
  const itemByRef = new Map((items ?? []).map((item) => [item.ref, item]));
  const shown = refs.slice(0, LIST_INLINE_LIMIT);
  const overflow = refs.length - shown.length;
  const total = provenance?.total;

  return (
    <div
      className={cn(
        "my-1 w-full overflow-hidden rounded-lg bg-background ring-1 ring-border/60"
      )}
    >
      <div className="divide-y divide-border/50">
        {shown.map((ref) => (
          <TeamMemberRow
            key={ref.id}
            memberId={ref.id}
            snapshot={itemByRef.get(`team:member:${ref.id}`)}
          />
        ))}
      </div>
      {overflow > 0 || (total && total > refs.length) ? (
        <Link
          className="block border-border/50 border-t px-3 py-1.5 text-muted-foreground text-xs transition-colors hover:text-foreground"
          to="/mdl/team"
        >
          {overflow > 0 ? `+${overflow} more · ` : ""}
          {total && total > refs.length
            ? `${refs.length} of ${total} — open team`
            : "open team"}
        </Link>
      ) : null}
    </div>
  );
}
