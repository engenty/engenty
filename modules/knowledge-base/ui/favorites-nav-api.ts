import { requestApiJson } from "@engenty/api-client";
import {
  emptyFavoritesNavDocument,
  FAVORITES_NAV_SETTING_KEY,
  type FavoritesNavDocument,
  parseFavoritesNavDocument,
} from "@engenty/user-settings";

const USER_SETTINGS = "/api/user-settings";

export async function fetchFavoritesNavDocument(
  signal?: AbortSignal
): Promise<FavoritesNavDocument> {
  const res = await requestApiJson<{
    name: string;
    type: string;
    value: unknown;
  }>(`${USER_SETTINGS}/${encodeURIComponent(FAVORITES_NAV_SETTING_KEY)}`, {
    method: "GET",
    signal,
  });
  return parseFavoritesNavDocument(res.value) ?? emptyFavoritesNavDocument();
}

export async function saveFavoritesNavDocument(
  doc: FavoritesNavDocument
): Promise<void> {
  await requestApiJson(
    `${USER_SETTINGS}/${encodeURIComponent(FAVORITES_NAV_SETTING_KEY)}`,
    {
      method: "PATCH",
      body: { type: "json", value_jsonb: doc },
    }
  );
}
