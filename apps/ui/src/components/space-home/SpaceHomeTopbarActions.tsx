/**
 * The space dashboard's topbar cluster: inbox, settings, overflow.
 *
 * Settings is its own icon because that is where you go to change the space;
 * the overflow holds the things you do from here without leaving home. Copy
 * link is always available. People opens the same picker the sidebar uses, so
 * adding someone does not take a trip through Settings.
 */
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  topbarIconButtonClassName,
} from "@engenty/ui-core";
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { Link2, MoreVertical, Settings, Users } from "lucide-react";
import { useCallback } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { SpacePeopleDialog } from "@/components/spaces/SpacePeopleDialog";
import {
  SpaceMemberRemoveConfirm,
  useSpaceRoster,
} from "@/components/spaces/space-roster";
import { isPersonalSpace, type Space } from "@/lib/api/spaces-client";
import { spaceRootPath, spaceSettingsPath } from "@/lib/space-routes";
import { SpaceHomeInboxBell } from "./SpaceHomeInboxBell";

/**
 * The compact topbar forces `!px-2` on action buttons, which leaves a wide
 * empty gap on an icon-only control. Square the hit-target the way the agent
 * desk does.
 */
const iconButtonClassName = cn(
  topbarIconButtonClassName,
  "!size-7 !w-7 !min-w-7 !px-0"
);

export function SpaceHomeTopbarActions({ space }: { space: Space }) {
  const { t } = useTranslation("common");
  const { isSuperAdmin, isTenantAdmin } = useWorkspaceContext();
  const personal = isPersonalSpace(space);
  const canManage = Boolean(isTenantAdmin || isSuperAdmin);
  const roster = useSpaceRoster(personal ? null : space.id);

  const copyLink = useCallback(() => {
    const href = `${window.location.origin}${spaceRootPath(space.key)}`;
    void navigator.clipboard.writeText(href).then(
      () =>
        toast.success(
          t("spaces.home.menu.linkCopied", { defaultValue: "Link copied" })
        ),
      () =>
        toast.error(
          t("spaces.home.menu.linkCopyFailed", {
            defaultValue: "Could not copy link",
          })
        )
    );
  }, [space.key, t]);

  return (
    <div className="flex items-center gap-0.5">
      <SpaceHomeInboxBell
        buttonClassName={iconButtonClassName}
        spaceKey={space.key}
      />
      <Button
        asChild
        className={iconButtonClassName}
        size="icon-sm"
        variant="ghost"
      >
        <Link
          aria-label={t("navigation.settings", { defaultValue: "Settings" })}
          to={spaceSettingsPath(space.key)}
        >
          <Settings aria-hidden className="size-4" />
        </Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={t("actions.more", { defaultValue: "More actions" })}
            className={iconButtonClassName}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <MoreVertical aria-hidden className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-40">
          <DropdownMenuItem onSelect={copyLink}>
            <Link2 className="mr-2 size-4" />
            {t("spaces.home.menu.copyLink", { defaultValue: "Copy link" })}
          </DropdownMenuItem>
          {personal ? null : (
            <DropdownMenuItem onSelect={() => roster.setPickerOpen(true)}>
              <Users className="mr-2 size-4" />
              {t("spaces.members.manageAction", {
                defaultValue: "Manage people",
              })}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {personal ? null : (
        <>
          <SpacePeopleDialog canManage={canManage} roster={roster} />
          <SpaceMemberRemoveConfirm roster={roster} />
        </>
      )}
    </div>
  );
}
