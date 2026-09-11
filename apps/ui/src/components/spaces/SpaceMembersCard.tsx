/**
 * The People card on a space's settings page.
 *
 * A sibling of `SpaceMembersSection`, not a variant of it: the sidebar's list
 * is a glance while this is the administration surface, in the settings idiom
 * the rest of `/settings` uses — avatar rows on a flush card, a role chip,
 * one footer action. The rows are this file's; everything the two surfaces
 * must agree on (queries, addable set, labels, the picker, the remove
 * confirmation) lives in `space-roster.tsx`.
 */
import { useTranslation } from "@engenty/i18n/ui";
import { Avatar, AvatarFallback, Button, Skeleton } from "@engenty/ui-core";
import { Settings2, X } from "lucide-react";
import { SpacePeopleDialog } from "./SpacePeopleDialog";
import {
  initials,
  memberLabel,
  SpaceMemberRemoveConfirm,
  useSpaceRoster,
} from "./space-roster";

export function SpaceMembersCard({
  canManage,
  spaceId,
}: {
  canManage: boolean;
  spaceId: string;
}) {
  const { t } = useTranslation("common");
  const roster = useSpaceRoster(spaceId);

  return (
    <div className="divide-y divide-border">
      {roster.membersPending
        ? [0, 1, 2].map((index) => (
            <div className="flex items-center gap-3 px-4 py-3" key={index}>
              <Skeleton className="size-8 rounded-full" />
              <div className="flex flex-1 flex-col gap-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
          ))
        : null}

      {roster.members.map((member) => {
        const label = memberLabel(member);
        // A shared space's owner is its steward; removing them would leave a
        // room nobody is answerable for. Handing over is a separate action,
        // not a delete with nothing to replace it.
        const removable = canManage && member.role !== "owner";
        return (
          <div
            className="group flex items-center gap-3 px-4 py-3"
            key={member.userId}
          >
            <Avatar className="size-8">
              <AvatarFallback className="bg-primary/5 font-bold text-[10px] text-primary">
                {initials(label)}
              </AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium text-foreground text-sm">
                  {label}
                </span>
                {member.role === "owner" ? (
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0 font-semibold text-[10px] text-primary uppercase tracking-wider">
                    {t("spaces.members.owner")}
                  </span>
                ) : null}
              </div>
              {member.email ? (
                <span className="truncate text-muted-foreground text-xs">
                  {member.email}
                </span>
              ) : null}
            </div>
            {removable ? (
              <Button
                aria-label={t("spaces.members.removeAction", { name: label })}
                // Hidden until the row is hovered, but never hidden from the
                // keyboard: `focus-visible` brings it back, so tabbing through
                // the roster still reaches it.
                className="size-7 shrink-0 p-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                disabled={roster.removeMember.isPending}
                onClick={() => roster.requestRemove(member)}
                variant="ghost"
              >
                <X className="size-3.5" />
              </Button>
            ) : null}
          </div>
        );
      })}

      {!roster.membersPending && roster.members.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="text-muted-foreground text-sm">
            {t("spaces.members.empty")}
          </p>
        </div>
      ) : null}

      {canManage ? (
        <button
          className="flex w-full items-center justify-center gap-2 px-4 py-3 font-semibold text-primary text-xs transition-colors hover:bg-primary/5"
          onClick={() => roster.setPickerOpen(true)}
          type="button"
        >
          <Settings2 className="size-3" />
          {t("spaces.members.manageAction")}
        </button>
      ) : null}

      <SpacePeopleDialog canManage={canManage} roster={roster} />
      <SpaceMemberRemoveConfirm roster={roster} />
    </div>
  );
}
