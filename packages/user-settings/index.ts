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
