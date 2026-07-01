/**
 * KB sidebar live-cache bindings.
 *
 * Realtime postgres changes on `module_kb.articles` and `module_kb.categories`
 * fan out to TanStack invalidations for the sidebar tree (article list +
 * category list). Bindings are scoped to a single KB id, so other tenants'
 * KBs or KBs the user has not opened do not trigger refetches.
 *
 * Realtime events are signals only — full data still flows through the
 * Hono API on refetch (see `docs/content/dev/security/live-cache-security.md`).
 */

import type { LiveCacheBinding } from "@engenty/live-cache";
import { kbArticleKeys, kbCategoryKeys } from "./queries.js";

export function createKbSidebarLiveBindings(kbId: string): LiveCacheBinding[] {
  if (!kbId) {
    return [];
  }
  return [
    {
      id: "kb_sidebar",
      postgresChanges: [
        { schema: "module_kb", table: "articles" },
        { schema: "module_kb", table: "categories" },
      ],
      resolveQueryKeys: (_ctx, signal) => {
        // Optional KB scoping: when the row payload carries `kb_id`, only
        // invalidate for the matching KB. Without `kb_id` on the row, fall
        // back to broad article invalidation so we never miss an update.
        const rowKbId =
          signal.kind === "postgres_changes"
            ? (signal.record?.kb_id as string | undefined)
            : undefined;
        if (rowKbId && rowKbId !== kbId) {
          return [];
        }
        if (
          signal.kind === "postgres_changes" &&
          signal.table === "categories"
        ) {
          return [kbCategoryKeys.list(kbId)];
        }
        // Articles list keys include filter params; invalidate the whole
        // article namespace so every active filter view in the sidebar
        // refetches once.
        return [kbArticleKeys.all];
      },
    },
  ];
}
