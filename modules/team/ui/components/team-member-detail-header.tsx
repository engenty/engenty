import { useTranslation } from "@engenty/i18n/ui";
import { useQueryClient } from "@engenty/query-client";
import { Badge, DetailPageHeader } from "@engenty/ui-core";
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { useCallback, useState } from "react";
import { type TeamMemberListItem, updateTeamMember } from "../api.js";
import { uploadTeamMemberPhotoViaVault } from "../lib/team-vault-upload.js";
import type { TeamMemberDetailTab } from "../member-detail-tabs.js";
import { teamMemberKeys } from "../queries.js";
import { TeamAvatarAiCreatorModal } from "./team-avatar-ai-creator-modal.js";
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
  const { currentTenant } = useWorkspaceContext();
  const tenantId = currentTenant?.id ?? null;
  const queryClient = useQueryClient();
  const [aiModalOpen, setAiModalOpen] = useState(false);

  const invalidateMember = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: teamMemberKeys.detailPage(member.id),
    });
    await queryClient.invalidateQueries({
      queryKey: teamMemberKeys.detail(member.id),
    });
    await queryClient.invalidateQueries({ queryKey: teamMemberKeys.all });
  }, [member.id, queryClient]);

  const handleAvatarGenerated = useCallback(
    async (file: File) => {
      if (!tenantId) {
        throw new Error("No tenant");
      }
      const uploaded = await uploadTeamMemberPhotoViaVault(file, {
        tenantId,
        profileId: member.id,
        kind: "profile",
      });
      await updateTeamMember(member.id, {
        profile_image_storage_key: uploaded.key,
      });
      await invalidateMember();
    },
    [invalidateMember, member.id, tenantId]
  );

  const handleDeleteAvatar = useCallback(async () => {
    await updateTeamMember(member.id, { profile_image_storage_key: null });
    await invalidateMember();
  }, [invalidateMember, member.id]);

  return (
    <>
      <DetailPageHeader
        belowStrip={<TeamMemberSubNav visibleTabs={visibleTabs} />}
        description={<TeamMemberProfileMeta member={member} />}
        media={
          <TeamMemberAvatar
            compact={false}
            fullName={member.full_name}
            initials={member.initials}
            onClick={tenantId ? () => setAiModalOpen(true) : undefined}
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

      <TeamAvatarAiCreatorModal
        hasExistingAvatar={Boolean(member.profile_image_storage_key)}
        initialName={member.full_name}
        onAvatarGenerated={handleAvatarGenerated}
        onDeleteAvatar={handleDeleteAvatar}
        onOpenChange={setAiModalOpen}
        open={aiModalOpen}
      />
    </>
  );
}
