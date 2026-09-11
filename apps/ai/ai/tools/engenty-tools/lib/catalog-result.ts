import { type SpaceGateContext, spaceScopeNote } from "./space-gate.js";

export const CATALOG_ONLY_MESSAGE =
  "These are operation contracts, not app records.";

export const CATALOG_NEXT =
  "Execute one returned operation before stating record facts.";

export const CATALOG_GLOBAL_SPACE_SCOPE =
  "This run is tenant-global; catalog results are not limited to a Space.";

export interface CatalogDiscoveryEnvelope {
  catalog_only: true;
  message: typeof CATALOG_ONLY_MESSAGE;
  next: typeof CATALOG_NEXT;
  ok: true;
  space_scope: string;
}

/**
 * Canonical catalog envelope for search, discover, and modules.
 *
 * Discovery identifies tool/module contracts. It is never app data: a hit on
 * `projects_list` is not a list of projects. The model must execute one
 * returned operation before stating record facts.
 */
export function catalogDiscoveryResult<T extends Record<string, unknown>>(
  space: SpaceGateContext | null | undefined,
  payload: T
): CatalogDiscoveryEnvelope & T {
  return {
    ok: true,
    catalog_only: true,
    ...payload,
    space_scope: spaceScopeNote(space) ?? CATALOG_GLOBAL_SPACE_SCOPE,
    message: CATALOG_ONLY_MESSAGE,
    next: CATALOG_NEXT,
  };
}
