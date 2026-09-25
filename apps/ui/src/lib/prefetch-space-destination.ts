import {
  roomKeys,
  spaceConversationsQueryOptions,
  spaceHomeQueryKey,
  spaceHomeQueryOptions,
} from "@engenty/ai-ui";
import type { QueryClient } from "@engenty/query-client";
import { readSpaceHomeCursor } from "@/lib/space-home-visit";

const PREFETCH_COOLDOWN_MS = 25_000;

const lastPrefetchAt = new Map<string, number>();

export function resetSpaceDestinationPrefetchCooldown(): void {
  lastPrefetchAt.clear();
}

/**
 * Warm the destination space's shell queries on hover/focus of a switcher
 * tile. Uses that space's stored home cursor so the first `/home` request
 * matches what the page will ask after navigation.
 */
export function prefetchSpaceDestination(
  queryClient: QueryClient,
  space: { id: string }
): void {
  const spaceId = space.id.trim();
  if (!spaceId) {
    return;
  }
  const now = Date.now();
  const last = lastPrefetchAt.get(spaceId) ?? 0;
  if (now - last < PREFETCH_COOLDOWN_MS) {
    return;
  }
  lastPrefetchAt.set(spaceId, now);
  const since = readSpaceHomeCursor(spaceId);
  void queryClient.prefetchQuery(spaceHomeQueryOptions(spaceId, since));
  void queryClient.prefetchQuery(spaceConversationsQueryOptions(spaceId));
}

export const spaceDestinationPrefetchKeys = {
  conversations: (spaceId: string) => roomKeys.list(spaceId),
  home: (spaceId: string, since: string | null) =>
    spaceHomeQueryKey(spaceId, since),
};
