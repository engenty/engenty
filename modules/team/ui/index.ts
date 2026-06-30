export type {
  TeamMemberCreateInput,
  TeamMemberListItem,
  TeamMemberUpdateInput,
} from "./api.js";
// Shared member-detail surface reused by extensions that contribute a tab/page
// (e.g. the team-hr module). All core team primitives — not HR-specific — so an
// extension renders inside the member detail without reaching into internals.
export { TeamMemberConnectUserSection } from "./components/team-member-connect-user-section.js";
export { TeamMemberDetailHeader } from "./components/team-member-detail-header.js";
export { TeamMemberProfileHeader } from "./components/team-member-profile-header.js";
export { TeamMemberSubNav } from "./components/team-member-sub-nav.js";
export { TeamModulePageScroll } from "./components/team-module-page-scroll.js";
export {
  useTeamMemberDetailTabNav,
  useVisibleTeamMemberDetailTabs,
} from "./hooks/use-team-member-detail-tabs.js";
export { useTeamModuleSecondaryShellNav } from "./hooks/use-team-module-secondary-shell-nav.js";
export { getTeamFileStorageSignedUrl } from "./lib/team-file-storage-url.js";
export {
  TEAM_MEMBER_PHOTO_ACCEPT,
  uploadTeamMemberPhotoViaVault,
} from "./lib/team-vault-upload.js";
// Member-detail tab seam — the public extension point by which other modules
// (e.g. the team-hr extension, or tasks' own "work" tab) contribute a tab to the
// team member detail page. Exposed so they import it from `@engenty/team/ui`
// rather than reaching into team internals.
export type {
  TeamMemberDetailTab,
  TeamMemberDetailTabContext,
} from "./member-detail-tabs.js";
export {
  getTeamMemberDetailTabs,
  getVisibleTeamMemberDetailTabs,
  registerTeamMemberDetailTab,
} from "./member-detail-tabs.js";
export {
  TeamMemberDetailPage,
  TeamMemberEditPage,
  TeamMembersListPage,
} from "./pages/index.js";
export {
  teamMemberKeys,
  useTeamMemberDetailPageQuery,
  useUpdateTeamMemberMutation,
} from "./queries.js";
export { teamLiveBinding } from "./team-live-binding.js";
