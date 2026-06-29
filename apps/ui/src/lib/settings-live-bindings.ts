import type { LiveCacheBinding } from "@engenty/live-cache";

/**
 * Settings tables live in `core`, not a module schema, so these bindings are
 * owned by the app shell rather than contributed by a module plugin. Both the
 * TENANT and the USER appearance tables are wired to realtime.
 *
 * USER binding (`core.user_settings`, scope "user" → filtered server-side to
 * `user_id=eq.{userId}`): syncs a user's own appearance — language, font size,
 * contrast, colors — live across their tabs and devices. This is safe ONLY
 * because light/dark is no longer re-applied on refetch:
 *   - next-themes is the single theme writer and syncs across a user's tabs via
 *     its own `storage` event, and
 *   - AppearanceBootstrap seeds setTheme exactly once per mount and never
 *     re-asserts it on a workspace-context refetch (the equality/seed guards).
 * So invalidating workspace-context here re-applies language/fonts/colors but
 * cannot touch the theme → no cross-tab flash. (This loop — invalidate → a
 * component re-applies theme → writes localStorage → `storage` echo → the other
 * tab re-applies → … — is exactly what previously kept this binding out; it was
 * removed by making AppearanceBootstrap refetch-proof.) Keep that single-writer
 * invariant intact and never call setTheme from a realtime handler.
 *
 * TENANT binding (`core.tenant_settings`): workspace defaults edited by an admin
 * (cross-USER, no shared localStorage); the viewer's personal theme override
 * protects light/dark, so at most workspace COLORS refresh live.
 *
 * Both are scoped to `appearance.*` rows so unrelated keys (copilot.layout,
 * dashboard.*, …) sharing the tables don't trigger spurious refetches.
 */
const isAppearanceChange = (signal: { record?: Record<string, unknown> }) =>
  typeof signal.record?.name === "string" &&
  signal.record.name.startsWith("appearance.");

// Mirrors preferredAppearanceKeys.all in @engenty/user-management-ui — the
// settings editor's query, refreshed so a second open editor picks up the change.
const PREFERRED_APPEARANCE_KEY = ["user-settings", "preferred-appearance"];

/** Postgres-change bindings for core settings tables (not module-owned). */
export const settingsLiveCacheBindings: LiveCacheBinding[] = [
  {
    id: "tenant-settings",
    postgresChanges: [{ schema: "core", table: "tenant_settings" }],
    resolveQueryKeys: (_ctx, signal) =>
      isAppearanceChange(signal)
        ? [["appearance-settings"], ["workspace-context"]]
        : [],
  },
  {
    id: "user-settings",
    postgresChanges: [
      { schema: "core", table: "user_settings", scope: "user" },
    ],
    resolveQueryKeys: (_ctx, signal) =>
      isAppearanceChange(signal)
        ? [["workspace-context"], PREFERRED_APPEARANCE_KEY]
        : [],
  },
];
