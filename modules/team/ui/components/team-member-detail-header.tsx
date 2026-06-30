import { useTranslation } from "@engenty/i18n/ui";
import { Badge, DetailPageHeader } from "@engenty/ui-core";
import type { TeamMemberListItem } from "../api.js";
import type { TeamMemberDetailTab } from "../member-detail-tabs.js";
import { TeamMemberAvatar } from "./team-member-avatar.js";
import { TeamMemberConnectUserSection } from "./team-member-connect-user-section.js";
import { MEMBER_TYPE_BADGE_VARIANT } from "./team-member-profile-header.js";
import { TeamMemberProfileMeta } from "./team-member-profile-meta.js";
import { TeamMemberSubNav } from "./team-member-sub-nav.js";

/**
 * Shared header for every member-detail page (profile + the team-hr HR page),
 * built on the common `DetailPageHeader`: avatar as the leading media, name as
 * the title, member-type badge + user-account linker as right-aligned state,
 * profile meta below, and the section tabs flush to the bottom edge. One source
 * so the sibling pages can't drift apart. Pages still own `usePageConfig`.
 */
export function TeamMemberDetailHeader({
  member,
  visibleTabs,
}: {
  member: TeamMemberListItem;
  visibleTabs: readonly TeamMemberDetailTab[];
}) {
  const { t } = useTranslation("team");

  return (
    <DetailPageHeader
      belowStrip={<TeamMemberSubNav visibleTabs={visibleTabs} />}
      description={<TeamMemberProfileMeta member={member} />}
      media={
        <TeamMemberAvatar
          compact={false}
          fullName={member.full_name}
          initials={member.initials}
          storageKey={member.profile_image_storage_key}
          variant="profile"
        />
      }
      status={
        <div className="flex items-center gap-3">
          <Badge variant={MEMBER_TYPE_BADGE_VARIANT[member.member_type]}>
            {t(`memberType.${member.member_type}`, {
              defaultValue: member.member_type,
            })}
          </Badge>
          <TeamMemberConnectUserSection
            currentEmail={member.email}
            currentUserId={member.user_id}
            memberId={member.id}
            t={t}
          />
        </div>
      }
      title={member.full_name}
    />
  );
}
