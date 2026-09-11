/**
 * The space the projects UI is currently inside (PLAN-spaces.md Phase 5/6).
 *
 * Every project carries a `space_id`, and the space is the entry point —
 * so a list rendered at `/s/marketing/projects` must not show the company
 * space's work. The space itself comes from `WorkspaceContext.currentSpace`,
 * which the shell drives from the URL.
 *
 * **Applied in the query hooks, not at the call sites.** There are several
 * places that list projects; asking each to remember a filter is how half of
 * them end up unfiltered. The hooks scope by default and a caller opts OUT
 * explicitly — see {@link ProjectSpaceScope} — which makes a tenant-wide
 * portfolio (every space) a visible decision rather than an omission.
 */
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";

/**
 * `current` — narrow to the space the user is in (the default).
 * `tenant`  — every space. For true cross-Space portfolio surfaces.
 */
export type ProjectSpaceScope = "current" | "tenant";

export function useProjectSpaceScope(
  scope: ProjectSpaceScope = "current"
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

/** Merge the scope into list/create params. An explicit `space_id` always wins. */
export function withProjectSpaceScope<T>(
  params: T & { space_id?: string | null },
  spaceId: string | undefined
): T & { space_id?: string | null } {
  if (params.space_id !== undefined || !spaceId) {
    return params;
  }
  return { ...params, space_id: spaceId };
}
