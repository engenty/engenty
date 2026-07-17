"use client";

import {
  ObjectCardFrame,
  type ObjectDisplayItem,
  ObjectListFooter,
  ObjectListRow,
  type ObjectRef,
  ObjectRowList,
  type ObjectWidgetCardProps,
} from "@engenty/ai-ui";
import { Avatar, AvatarFallback, Skeleton } from "@engenty/ui-core";
import { Mail } from "lucide-react";
import { useTeamMemberDetailQuery } from "../../queries.js";

/** Chat object widget for `team:member:<id>` refs — live data, viewer authz. */

const LIST_INLINE_LIMIT = 10;

function memberInitials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

function TeamMemberRow({
  memberRef,
  snapshot,
  onOpenInPanel,
}: {
  memberRef: ObjectRef;
  snapshot?: ObjectDisplayItem;
  onOpenInPanel?: (ref: ObjectRef) => void;
}) {
  const memberId = memberRef.id;
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
  const email = member?.email;

  return (
    <ObjectListRow
      actions={
        email
          ? [
              {
                icon: Mail,
                label: "Copy email",
                onSelect: () => void navigator.clipboard?.writeText(email),
              },
            ]
          : undefined
      }
      href={`/mdl/team/${memberId}`}
      media={
        <Avatar className="size-7">
          <AvatarFallback className="text-[10px]">
            {member?.initials ?? memberInitials(name)}
          </AvatarFallback>
        </Avatar>
      }
      meta={member?.position ?? undefined}
      objectRef={memberRef}
      onOpenInPanel={onOpenInPanel}
      subtitle={secondary}
      title={name}
      trailing={
        isError && !member ? (
          <span className="shrink-0 text-muted-foreground/70 text-xs">
            not available
          </span>
        ) : null
      }
    />
  );
}

export function TeamMemberObjectCard({
  refs,
  items,
  provenance,
  onOpenInPanel,
}: ObjectWidgetCardProps) {
  const itemByRef = new Map((items ?? []).map((item) => [item.ref, item]));
  const shown = refs.slice(0, LIST_INLINE_LIMIT);

  return (
    <ObjectCardFrame>
      <ObjectRowList>
        {shown.map((ref) => (
          <TeamMemberRow
            key={ref.id}
            memberRef={ref}
            onOpenInPanel={onOpenInPanel}
            snapshot={itemByRef.get(`team:member:${ref.id}`)}
          />
        ))}
      </ObjectRowList>
      <ObjectListFooter
        href="/mdl/team"
        label="team"
        overflow={refs.length - shown.length}
        shown={refs.length}
        total={provenance?.total}
      />
    </ObjectCardFrame>
  );
}
