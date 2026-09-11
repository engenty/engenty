/**
 * The space the tasks UI is currently inside (PLAN-spaces.md Phase 5/6).
 *
 * Every task carries a `space_id`, and the space is the entry point —
 * so a list rendered at `/s/marketing/tasks` must not show the company space's
 * work. The space itself comes from `WorkspaceContext.currentSpace`, which the
 * shell drives from the URL.
 *
 * **Applied in the query hooks, not at the call sites.** There are a dozen
 * places that list tasks; asking each to remember a filter is how half of them
 * end up unfiltered. The hooks scope by default and a caller opts OUT
 * explicitly — see {@link TaskSpaceScope} — which makes the tenant-wide lists
 * (a person's tasks across every space) a visible decision rather than an
 * omission.
 */
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";

/**
 * `current` — narrow to the space the user is in (the default).
 * `tenant`  — every space. For surfaces that are about a PERSON or the whole
 *             tenant rather than about this space.
 */
export type TaskSpaceScope = "current" | "tenant";

export function useTaskSpaceScope(
  scope: TaskSpaceScope = "current"
): string | undefined {
  const { currentSpace } = useWorkspaceContext();
  if (scope === "tenant") {
    return;
  }
  // No space at all (a tenant that predates the Phase 6 backfill, or a surface
  // rendered outside the shell) means "do not filter" — the pre-space
  // behaviour. Returning a bogus id would empty every list instead.
  return currentSpace?.id ?? undefined;
}

/** Merge the scope into list params. An explicit `space_id` always wins. */
export function withTaskSpaceScope<T extends { space_id?: string | null }>(
  params: T,
  spaceId: string | undefined
): T {
  if (params.space_id !== undefined || !spaceId) {
    return params;
  }
  return { ...params, space_id: spaceId };
}
