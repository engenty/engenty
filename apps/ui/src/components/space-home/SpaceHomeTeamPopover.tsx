/**
 * The people in the space, from the home header: their avatars, and a click
 * opens the list in place — the settings sidebar's section look (title, hint,
 * + on the right, the list in a card) on a solid surface. Removing still asks
 * first (`SpaceMemberRemoveConfirm`); the full picker stays in the topbar menu.
 */
import { useTranslation } from "@engenty/i18n/ui";
import {
  Avatar,
  AvatarFallback,
  AvatarStack,
  type AvatarStackProfile,
  Button,
  MultiSelect,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SettingsCard,
  SettingsSection,
} from "@engenty/ui-core";
import { Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  memberLabel,
  SpaceMemberRemoveConfirm,
  useSpaceRoster,
} from "@/components/spaces/space-roster";

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "?"
  );
}

export function SpaceHomeTeamPopover({
  canManage,
  spaceId,
  visibilityHint,
}: {
  canManage: boolean;
  spaceId: string;
  /** "Open to the team." / "Restricted to members." — the section's hint. */
  visibilityHint: string;
}) {
  const { t } = useTranslation("common");
  const roster = useSpaceRoster(spaceId);
  const [open, setOpen] = useState(false);
  const profiles = useMemo<AvatarStackProfile[]>(
    () =>
      roster.members.map((member) => ({
        full_name: memberLabel(member),
        id: member.userId,
      })),
    [roster.members]
  );
  const addOptions = useMemo(
    () =>
      roster.addable.map((person) => ({
        label: person.displayName?.trim() || person.email,
        value: person.id,
      })),
    [roster.addable]
  );

  if (profiles.length === 0) {
    return null;
  }

  return (
    <>
      <Popover
        onOpenChange={(next) => {
          setOpen(next);
          // The directory (who could be added) loads only once asked for.
          if (next && canManage) {
            roster.setPickerOpen(true);
          }
        }}
        open={open}
      >
        <PopoverTrigger asChild>
          <button
            aria-label={t("spaces.members.manageAction", {
              defaultValue: "Manage people",
            })}
            className="cursor-pointer rounded-full transition-opacity hover:opacity-90"
            title={visibilityHint}
            type="button"
          >
            <AvatarStack max={6} profiles={profiles} size="lg" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          // Solid, not the floating glass: this is a working surface.
          className="w-96 bg-background p-4 backdrop-blur-none"
        >
          <SettingsSection
            action={
              canManage && addOptions.length > 0 ? (
                <MultiSelect
                  align="end"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground [&_svg]:mx-auto [&_svg]:h-4 [&_svg]:w-4"
                  deduplicateOptions
                  defaultValue={[]}
                  disabled={roster.addMember.isPending}
                  hideSelectAll
                  key={roster.members.map((m) => m.userId).join(",")}
                  onValueChange={(ids) => {
                    for (const id of ids) {
                      roster.addMember.mutate(id);
                    }
                  }}
                  options={addOptions}
                  placeholder={t("spaces.members.searchPlaceholder")}
                  popoverClassName="w-64 max-w-full"
                  triggerElement={<Plus className="h-4 w-4" />}
                  variant="ghost"
                />
              ) : null
            }
            description={visibilityHint}
            title={t("spaces.members.section")}
          >
            <SettingsCard className="px-4 py-2">
              <ul>
                {roster.members.map((member) => {
                  const name = memberLabel(member);
                  return (
                    <li
                      className="group flex items-center gap-3 py-2.5"
                      key={member.userId}
                    >
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                          {initials(name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-sm leading-tight">
                          {name}
                        </p>
                        {member.role === "owner" ? (
                          <p className="text-muted-foreground text-xs leading-tight">
                            {t("spaces.members.owner")}
                          </p>
                        ) : null}
                      </div>
                      {canManage ? (
                        <Button
                          aria-label={t("spaces.members.removeAction", {
                            name,
                          })}
                          className="h-7 w-7 p-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                          onClick={() => roster.requestRemove(member)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </SettingsCard>
          </SettingsSection>
        </PopoverContent>
      </Popover>
      <SpaceMemberRemoveConfirm roster={roster} />
    </>
  );
}
