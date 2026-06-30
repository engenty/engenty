import { useTranslation } from "@engenty/i18n/ui";
import { Badge } from "@engenty/ui-core";
import type { TeamMemberListItem } from "../api.js";
import { TeamMemberAvatar } from "./team-member-avatar.js";
import { TeamMemberProfileMeta } from "./team-member-profile-meta.js";

export const MEMBER_TYPE_BADGE_VARIANT: Record<
  TeamMemberListItem["member_type"],
  "default" | "secondary" | "outline"
> = {
  internal: "secondary",
  external: "outline",
  contractor: "outline",
};

export function TeamMemberProfileHeader({
  member,
  showDetailsToggle,
}: {
  member: Pick<
    TeamMemberListItem,
    | "full_name"
    | "initials"
    | "profile_image_storage_key"
    | "position"
    | "department"
    | "email"
    | "phone"
    | "member_type"
    | "location_term_id"
    | "location_term"
    | "role_term_id"
    | "role_term"
  >;
  /** Optional toggle element rendered inline after the name (e.g. show/hide details). */
  showDetailsToggle?: React.ReactNode;
}) {
  const { t } = useTranslation("team");

  return (
    <div className="flex items-start gap-5 pb-2">
      {/* Large avatar */}
      <div className="shrink-0">
        <TeamMemberAvatar
          compact={false}
          fullName={member.full_name}
          initials={member.initials}
          storageKey={member.profile_image_storage_key}
          variant="profile"
        />
      </div>

      <div className="min-w-0 flex-1 space-y-1.5">
        {/* Name + member type badge + optional toggle */}
        <div className="flex flex-wrap items-baseline gap-2">
          <h1 className="font-semibold text-2xl leading-tight">
            {member.full_name}
          </h1>
          <Badge variant={MEMBER_TYPE_BADGE_VARIANT[member.member_type]}>
            {t(`memberType.${member.member_type}`, {
              defaultValue: member.member_type,
            })}
          </Badge>
          {showDetailsToggle && (
            <span className="ml-1">{showDetailsToggle}</span>
          )}
        </div>

        <TeamMemberProfileMeta member={member} />
      </div>
    </div>
  );
}
