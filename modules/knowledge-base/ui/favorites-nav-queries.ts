import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";
import {
  FAVORITES_NAV_SETTING_KEY,
  type FavoriteNavItem,
  removeFavoriteNavItem,
  toggleFavoriteNavItem,
} from "@engenty/user-settings";
import {
  fetchFavoritesNavDocument,
  saveFavoritesNavDocument,
} from "./favorites-nav-api.js";

export const favoritesNavQueryKey = [
  "user-settings",
  FAVORITES_NAV_SETTING_KEY,
] as const;

export function favoritesNavQueryOptions() {
  return queryOptions({
    queryKey: favoritesNavQueryKey,
    queryFn: ({ signal }) => fetchFavoritesNavDocument(signal),
    staleTime: 30_000,
  });
}

export function useKbFavoritesNavQuery() {
  return useQuery(favoritesNavQueryOptions());
}

export function useKbToggleFavoriteNavMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      item: Omit<FavoriteNavItem, "created_at"> & { created_at?: string }
    ) => {
      const current = await queryClient.fetchQuery(favoritesNavQueryOptions());
      const next = toggleFavoriteNavItem(current, item);
      await saveFavoritesNavDocument(next);
      return next;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(favoritesNavQueryKey, data);
    },
  });
}

export function useKbRemoveFavoriteNavMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (to: string) => {
      const current = await queryClient.fetchQuery(favoritesNavQueryOptions());
      const next = removeFavoriteNavItem(current, to);
      await saveFavoritesNavDocument(next);
      return next;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(favoritesNavQueryKey, data);
    },
  });
}
