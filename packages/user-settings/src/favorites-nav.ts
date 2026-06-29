import { z } from "zod";

/** User-settings JSON key — Knowledge Base module personal favorites only. */
export const FAVORITES_NAV_SETTING_KEY = "knowledge-base.favorites.nav.v1";

export const FAVORITES_NAV_MAX_ITEMS = 80;

export const favoriteNavItemSchema = z.object({
  to: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string().nullable().optional(),
  created_at: z.string(),
});

export const favoritesNavDocumentSchema = z.object({
  items: z.array(favoriteNavItemSchema).max(FAVORITES_NAV_MAX_ITEMS),
});

export type FavoriteNavItem = z.infer<typeof favoriteNavItemSchema>;
export type FavoritesNavDocument = z.infer<typeof favoritesNavDocumentSchema>;

export function parseFavoritesNavDocument(
  value: unknown
): FavoritesNavDocument | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const parsed = favoritesNavDocumentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function emptyFavoritesNavDocument(): FavoritesNavDocument {
  return { items: [] };
}

/** If `to` exists, remove it; otherwise prepend (newest first). */
export function toggleFavoriteNavItem(
  doc: FavoritesNavDocument,
  item: Omit<FavoriteNavItem, "created_at"> & { created_at?: string }
): FavoritesNavDocument {
  const created_at = item.created_at ?? new Date().toISOString();
  const next: FavoriteNavItem = {
    to: item.to,
    title: item.title,
    subtitle: item.subtitle ?? null,
    created_at,
  };
  const without = doc.items.filter((x) => x.to !== next.to);
  if (without.length === doc.items.length) {
    const merged = [next, ...without].slice(0, FAVORITES_NAV_MAX_ITEMS);
    return { items: merged };
  }
  return { items: without };
}

export function removeFavoriteNavItem(
  doc: FavoritesNavDocument,
  to: string
): FavoritesNavDocument {
  return { items: doc.items.filter((x) => x.to !== to) };
}

export function isFavoriteNavTo(
  doc: FavoritesNavDocument,
  to: string
): boolean {
  return doc.items.some((x) => x.to === to);
}
