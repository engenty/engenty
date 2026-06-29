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
  const supabase = engenty.server.getDatabaseAdapter?.() ?? null;
  if (!supabase) {
    return;
  }
  const repoOrFactory = (auth: { principalId: string }) =>
    createUserSettingsRepoSupabase(supabase, auth.principalId);
  registerUserSettingsApi(engenty.server, repoOrFactory);
};

export default registerUserSettingsPlugin;
