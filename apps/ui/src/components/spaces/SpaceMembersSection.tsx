/**
 * Who is in this space, at a glance — the roster at the foot of the space's
 * own sidebar (PLAN-spaces.md Phase P).
 *
 * The hover "+" opens the full people manager. Removing stays off this glance:
 * an × beside a colleague in the everyday sidebar invites a mistake.
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
  spaceId,
  spaceKey,
}: {
  /** Hover "+" that opens the add-people picker. Independent of remove. */
  canAdd?: boolean;
  canManage: boolean;
  spaceId: string | null;
  spaceKey: string;
}) {
  const { t } = useTranslation("common");
  const roster = useSpaceRoster(spaceId);
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
        count={roster.members.length}
        onOpenChange={setOpen}
        open={open}
      >
        {t("spaces.members.section", { defaultValue: "People" })}
      </SpaceSectionHeading>

      <CollapsibleContent>
        {roster.membersPending ? (
          <div className="flex flex-col gap-1">
            {[0, 1].map((index) => (
              <div
                className="h-7 animate-pulse rounded-[8px] bg-muted"
                key={index}
              />
            ))}
          </div>
        ) : null}

        {roster.members.map((member) => {
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

        {roster.membersPending || roster.members.length > 0 ? null : (
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
