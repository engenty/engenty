/**
 * Who is in this space, at a glance — the roster at the foot of the space's
 * own sidebar (PLAN-spaces.md Phase P).
 *
 * The hover "+" opens the full people manager. Removing stays off this glance:
 * an × beside a colleague in the everyday sidebar invites a mistake.
 *
 * A personal space has no member rows: `owner_user_id` is its whole access
 * grant, and `core.forbid_personal_space_member` rejects any row that says
 * otherwise. It still shows a People section with its owner as the sole
 * person, plus a note explaining why nobody can be added.
 */
import { useTranslation } from "@engenty/i18n/ui";
import { Button, Collapsible, CollapsibleContent, cn } from "@engenty/ui-core";
import { X } from "lucide-react";
import {
  SPACE_SECTION_OPEN_KEYS,
  useSpaceSectionOpen,
} from "@/lib/use-space-section-open";
import { SpacePeopleDialog } from "./SpacePeopleDialog";
import {
  initials,
  memberLabel,
  SpaceMemberRemoveConfirm,
  useSpaceRoster,
} from "./space-roster";
import {
  SpaceSectionAddButton,
  SpaceSectionHeading,
} from "./space-section-heading";

export function SpaceMembersSection({
  canAdd = false,
  canManage,
  personalOwnerLabel,
  spaceId,
  spaceKey,
}: {
  /** Hover "+" that opens the add-people picker. Independent of remove. */
  canAdd?: boolean;
  canManage: boolean;
  /** Present for a personal space, whose owner is its only person. */
  personalOwnerLabel?: string;
  spaceId: string | null;
  spaceKey: string;
}) {
  const { t } = useTranslation("common");
  const isPersonal = personalOwnerLabel != null;
  // Personal spaces cannot have member rows; do not ask the members endpoint
  // for a roster the database explicitly forbids.
  const roster = useSpaceRoster(isPersonal ? null : spaceId);
  const [open, setOpen] = useSpaceSectionOpen(
    SPACE_SECTION_OPEN_KEYS.members,
    spaceKey
  );

  if (!spaceId) {
    return null;
  }

  return (
    <Collapsible
      className="group/section flex flex-col"
      onOpenChange={setOpen}
      open={open}
    >
      <SpaceSectionHeading
        action={
          canAdd ? (
            <SpaceSectionAddButton
              aria-label={t("spaces.members.addAction", {
                defaultValue: "Add someone",
              })}
              onClick={() => roster.setPickerOpen(true)}
            />
          ) : null
        }
        count={isPersonal ? 1 : roster.members.length}
        onOpenChange={setOpen}
        open={open}
      >
        {t("spaces.members.section", { defaultValue: "People" })}
      </SpaceSectionHeading>

      <CollapsibleContent>
        {isPersonal ? (
          <>
            <div className="flex items-center gap-2 rounded-[8px] px-2 py-0.5 text-foreground text-sm">
              <span
                aria-hidden
                className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/5 font-semibold text-[10px] text-primary"
              >
                {initials(personalOwnerLabel)}
              </span>
              <span
                className="min-w-0 flex-1 truncate"
                title={personalOwnerLabel}
              >
                {personalOwnerLabel}
              </span>
              <span className="shrink-0 text-[10px] uppercase tracking-wide">
                {t("spaces.members.you", { defaultValue: "You" })}
              </span>
            </div>
            <p className="px-2 text-muted-foreground text-xs leading-relaxed">
              {t("spaces.members.personalNote", {
                defaultValue: "This is your personal, private space.",
              })}
            </p>
          </>
        ) : null}

        {!isPersonal && roster.membersPending ? (
          <div className="flex flex-col gap-1">
            {[0, 1].map((index) => (
              <div
                className="h-7 animate-pulse rounded-[8px] bg-muted"
                key={index}
              />
            ))}
          </div>
        ) : null}

        {isPersonal
          ? null
          : roster.members.map((member) => {
              const label = memberLabel(member);
              // A shared space's owner is its steward; removing them would leave a
              // room nobody is answerable for. Handing over is a separate action,
              // not a delete with nothing to replace it.
              const removable = canManage && member.role !== "owner";
              return (
                <div
                  className={cn(
                    "flex items-center gap-2 rounded-[8px] px-2 py-0.5 text-sm",
                    "text-foreground hover:bg-muted/50"
                  )}
                  key={member.userId}
                >
                  <span
                    aria-hidden
                    className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/5 font-semibold text-[10px] text-primary"
                  >
                    {initials(label)}
                  </span>
                  <span className="min-w-0 flex-1 truncate" title={label}>
                    {label}
                  </span>
                  {member.role === "owner" ? (
                    <span className="shrink-0 text-[10px] uppercase tracking-wide">
                      {t("spaces.members.owner", { defaultValue: "Owner" })}
                    </span>
                  ) : null}
                  {removable ? (
                    <Button
                      aria-label={t("spaces.members.removeAction", {
                        defaultValue: "Remove {{name}}",
                        name: label,
                      })}
                      className="size-6 shrink-0 p-0 text-muted-foreground hover:text-foreground"
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

        {isPersonal ||
        roster.membersPending ||
        roster.members.length > 0 ? null : (
          <p className="px-2 text-muted-foreground text-sm">
            {t("spaces.members.empty", { defaultValue: "Nobody here yet." })}
          </p>
        )}
      </CollapsibleContent>

      <SpacePeopleDialog canManage={canAdd || canManage} roster={roster} />
      <SpaceMemberRemoveConfirm roster={roster} />
    </Collapsible>
  );
}
