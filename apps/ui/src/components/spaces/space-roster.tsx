/**
 * The shared half of a space's roster (PLAN-spaces.md Phase P).
 *
 * Two surfaces show who is in a space — the glance at the foot of the space
 * sidebar (`SpaceMembersSection`) and the People card on its settings page
 * (`SpaceMembersCard`). They deliberately keep their OWN row chrome: a
 * sidebar row and a settings row are different idioms, and serving both from
 * one renderer is what once put an uppercase "PEOPLE" label inside a card
 * already titled People. What they must never disagree about lives here
 * instead: the queries and mutations, who counts as addable, how a member is
 * labelled, and the remove confirmation.
 *
 * **Removing always asks.** Removing someone is not undoable from either
 * surface (adding them back is a different action, and only an admin can),
 * so both rosters confirm — the sidebar used to remove on a single click
 * only because the two components had drifted apart.
 *
 * Nothing here is an access decision. `/api/spaces/:id/members` is gated on
 * being able to ENTER the space and every write is re-gated server-side by
 * `requireSpaceSetupAccess`; hiding controls is courtesy.
 */
import { useTranslation } from "@engenty/i18n/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@engenty/ui-core";
import { useMemo, useState } from "react";
import type { DirectoryUser, SpaceMember } from "@/lib/api/spaces-client";
import {
  useAddSpaceMemberMutation,
  useRemoveSpaceMemberMutation,
  useSpaceMembersQuery,
  useUserDirectoryQuery,
} from "@/lib/spaces-queries";

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return "?";
  }
  if (words.length === 1) {
    return (words[0] ?? "").slice(0, 2).toUpperCase();
  }
  return `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`.toUpperCase();
}

/**
 * A member's name, falling back through what the row actually has.
 *
 * The last resort is the raw user id rather than "Unknown": a row whose user
 * record has gone is a real state (`displayName` and `email` both null), and
 * an id someone can search for beats a word that tells them nothing.
 */
export function memberLabel(member: SpaceMember): string {
  return member.displayName?.trim() || member.email?.trim() || member.userId;
}

export interface SpaceRoster {
  addable: DirectoryUser[];
  addMember: ReturnType<typeof useAddSpaceMemberMutation>;
  /** The member a remove confirmation is open for. */
  confirming: SpaceMember | null;
  directoryPending: boolean;
  members: SpaceMember[];
  membersPending: boolean;
  pickerOpen: boolean;
  removeMember: ReturnType<typeof useRemoveSpaceMemberMutation>;
  /** Open the confirm dialog for this member — never removes directly. */
  requestRemove: (member: SpaceMember) => void;
  setConfirming: (member: SpaceMember | null) => void;
  setPickerOpen: (open: boolean) => void;
}

export function useSpaceRoster(spaceId: string | null): SpaceRoster {
  const [pickerOpen, setPickerOpen] = useState(false);
  // Removing someone is not undoable from here, so the row asks before it
  // acts — from BOTH surfaces.
  const [confirming, setConfirming] = useState<SpaceMember | null>(null);
  const membersQuery = useSpaceMembersQuery(spaceId);
  // Only fetched once the picker is opened — most visits never open it, and
  // this is a tenant-wide list.
  const directoryQuery = useUserDirectoryQuery(pickerOpen);
  const addMember = useAddSpaceMemberMutation(spaceId);
  const removeMember = useRemoveSpaceMemberMutation(spaceId);

  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data]);
  const memberIds = useMemo(
    () => new Set(members.map((member) => member.userId)),
    [members]
  );
  const addable = useMemo(
    () => (directoryQuery.data ?? []).filter((user) => !memberIds.has(user.id)),
    [directoryQuery.data, memberIds]
  );

  return {
    addable,
    addMember,
    confirming,
    directoryPending: directoryQuery.isPending,
    members,
    membersPending: membersQuery.isPending,
    pickerOpen,
    removeMember,
    requestRemove: setConfirming,
    setConfirming,
    setPickerOpen,
  };
}

/** The remove confirmation both surfaces route through. */
export function SpaceMemberRemoveConfirm({ roster }: { roster: SpaceRoster }) {
  const { t } = useTranslation("common");
  const { confirming, removeMember, setConfirming } = roster;
  return (
    <AlertDialog
      onOpenChange={(next) => {
        if (!next) {
          setConfirming(null);
        }
      }}
      open={confirming != null}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("spaces.members.removeConfirmTitle", {
              name: confirming ? memberLabel(confirming) : "",
            })}
          </AlertDialogTitle>
          {/* What actually happens, because "remove" alone reads as delete:
              access goes, their work stays. */}
          <AlertDialogDescription>
            {t("spaces.members.removeConfirmDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={removeMember.isPending}
            onClick={() => {
              if (confirming) {
                removeMember.mutate(confirming.userId);
              }
              setConfirming(null);
            }}
          >
            {t("spaces.members.removeConfirmAction")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
