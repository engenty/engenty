import type { EngentyPluginFactory } from "@engenty/plugin-sdk";
import { registerUserSettingsApi } from "./src/api/index.js";
import { createUserSettingsRepoSupabase } from "./src/dal/index.js";

export { createUserSettingsRepoSupabase } from "./src/dal/index.js";
export {
  emptyFavoritesNavDocument,
  FAVORITES_NAV_MAX_ITEMS,
  FAVORITES_NAV_SETTING_KEY,
  type FavoriteNavItem,
  type FavoritesNavDocument,
  favoriteNavItemSchema,
  favoritesNavDocumentSchema,
  isFavoriteNavTo,
  parseFavoritesNavDocument,
  removeFavoriteNavItem,
  toggleFavoriteNavItem,
} from "./src/favorites-nav.js";
export {
  emptySpaceDataLibraryDocument,
  parseSpaceDataLibraryDocument,
  SPACE_DATA_LIBRARY_KINDS,
  SPACE_DATA_LIBRARY_MAX_RECENT_PER_SPACE,
  SPACE_DATA_LIBRARY_SETTING_KEY,
  type SpaceDataLibraryDocument,
  type SpaceDataLibraryItem,
  type SpaceDataLibraryItemInput,
  type SpaceDataLibraryKind,
  spaceDataLibraryDocumentSchema,
  spaceDataLibraryItemSchema,
  spaceDataRecentForSpace,
  touchSpaceDataRecent,
} from "./src/space-data-library.js";
export {
  agentNavForSpace,
  emptySpacesAgentNavDocument,
  emptySpacesAgentNavSpace,
  parseSpacesAgentNavDocument,
  pinSpaceAgent,
  pruneSpacesAgentNav,
  SPACES_AGENT_NAV_MAX_ORDER,
  SPACES_AGENT_NAV_MAX_PINNED,
  SPACES_AGENT_NAV_SETTING_KEY,
  type SpacesAgentNavDocument,
  type SpacesAgentNavSpace,
  setSpaceAgentPinnedOrder,
  setSpaceAgentUnpinnedOrder,
  spacesAgentNavDocumentSchema,
  spacesAgentNavSpaceSchema,
  unpinSpaceAgent,
} from "./src/spaces-agent-nav.js";
export {
  artifactPinsForSpace,
  emptySpacesArtifactPinsDocument,
  emptySpacesArtifactPinsSpace,
  isSpaceArtifactPinned,
  parseSpacesArtifactPinsDocument,
  pinnedArtifactsInOrder,
  pinSpaceArtifact,
  pruneSpaceArtifactPins,
  SPACES_ARTIFACT_PINS_MAX_PER_SPACE,
  SPACES_ARTIFACT_PINS_SETTING_KEY,
  type SpacesArtifactPinsDocument,
  type SpacesArtifactPinsSpace,
  spacesArtifactPinsDocumentSchema,
  spacesArtifactPinsSpaceSchema,
  unpinSpaceArtifact,
} from "./src/spaces-artifact-pins.js";
export {
  BUILT_IN_SECTION_IDS,
  type BuiltInSectionId,
  type ConversationItemKind,
  type ConversationNavItem,
  type ConversationNavSection,
  conversationItemKey,
  conversationNavForSpace,
  conversationNavItemSchema,
  conversationNavSectionSchema,
  createConversationSection,
  deleteConversationSection,
  emptySpacesConversationNavDocument,
  emptySpacesConversationNavSpace,
  foldAgentNavIntoConversationNav,
  hideConversation,
  isBuiltInSectionId,
  isConversationHidden,
  isConversationNavItem,
  parseConversationItem,
  parseSpacesConversationNavDocument,
  pinConversation,
  placeConversation,
  pruneSpacesConversationNav,
  renameConversationSection,
  SPACES_CONVERSATION_NAV_MAX_ITEM_ORDER,
  SPACES_CONVERSATION_NAV_MAX_PINNED,
  SPACES_CONVERSATION_NAV_MAX_SECTIONS,
  SPACES_CONVERSATION_NAV_SETTING_KEY,
  type SpacesConversationNavDocument,
  type SpacesConversationNavSpace,
  setConversationItemOrder,
  setConversationSectionOrder,
  setPinnedConversationOrder,
  spacesConversationNavDocumentSchema,
  spacesConversationNavSpaceSchema,
  unhideConversation,
  unpinConversation,
} from "./src/spaces-conversation-nav.js";
export {
  emptySpacesRecentDocument,
  parseSpacesRecentDocument,
  SPACES_RECENT_MAX_ITEMS,
  SPACES_RECENT_SETTING_KEY,
  type SpaceRecentItem,
  type SpacesRecentDocument,
  spaceRecentItemSchema,
  spacesRecentDocumentSchema,
  spacesRecentOrder,
  touchSpaceRecency,
} from "./src/spaces-recent.js";

const registerUserSettingsPlugin: EngentyPluginFactory = (engenty) => {
  // Phase A seam (PLAN-tenant-isolation-a-rls-seam.md): user settings are
  // tenant-stamped rows (20260809230000); the repo resolves a tenant-locked
  // handle per call. Per-user scoping stays code-enforced belt inside the repo.
  const getTenantDb = engenty.server.getTenantDb;
  if (!getTenantDb) {
    return;
  }
  const repoOrFactory = (auth: { principalId: string; tenantId: string }) =>
    createUserSettingsRepoSupabase(
      getTenantDb(auth),
      auth.principalId,
      auth.tenantId
    );
  registerUserSettingsApi(engenty.server, repoOrFactory);
};

export default registerUserSettingsPlugin;
