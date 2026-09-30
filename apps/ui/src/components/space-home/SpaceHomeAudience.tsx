/**
 * The home header's right slot — same width as Module/Extensions below, not a
 * card. It names who is in the space and whether the rest of the team may
 * walk in.
 */
import { useTranslation } from "@engenty/i18n/ui";
import { AvatarStack, type AvatarStackProfile } from "@engenty/ui-core";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { memberLabel } from "@/components/spaces/space-roster";
import type { Space } from "@/lib/api/spaces-client";
import {
  SPACE_SETTINGS_PEOPLE_HASH,
  spaceSettingsPath,
} from "@/lib/space-routes";
import { useSpaceMembersQuery } from "@/lib/spaces-queries";

export function SpaceHomeAudience({ space }: { space: Space }) {
  const { t } = useTranslation("common");
  const membersQuery = useSpaceMembersQuery(space.id);
  const profiles = useMemo<AvatarStackProfile[]>(
    () =>
      (membersQuery.data ?? []).map((member) => ({
        full_name: memberLabel(member),
        id: member.userId,
      })),
    [membersQuery.data]
  );

  const restricted = space.visibility === "private";

  return (
    <Link
      className="flex cursor-pointer flex-col gap-1 rounded-[10px] hover:bg-accent/40"
      to={{
        hash: SPACE_SETTINGS_PEOPLE_HASH,
        pathname: spaceSettingsPath(space.key),
      }}
    >
      {membersQuery.isPending ? (
        <span className="mx-1 h-7 w-16 animate-pulse rounded-full bg-muted" />
      ) : profiles.length > 0 ? (
        <div className="px-1">
          <AvatarStack max={8} profiles={profiles} size="sm" />
        </div>
      ) : null}
      <p className="px-1 text-[12.5px] text-muted-foreground leading-snug">
        {restricted
          ? t("spaces.home.teamSpace.restricted", {
              defaultValue: "Restricted to members.",
            })
          : t("spaces.home.teamSpace.open", {
              defaultValue: "Open to the team.",
            })}
      </p>
    </Link>
  );
}
