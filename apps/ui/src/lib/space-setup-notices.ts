/**
 * What to tell the person after a space setup saved, about modules whose own
 * first-use setup did not finish (`mounted[]` in the setup answer).
 *
 * A module that is ready says nothing — the mount is the news. One that is
 * not ready is named, with what it still needs: a missing tenant setting is
 * fixed once by an admin, and re-adding the module retries the setup.
 */
import type { SpaceMountSetupResult } from "./api/spaces-client";

export interface SpaceSetupNotice {
  error: string | null;
  moduleId: string;
  moduleName: string;
  /** `needs` codes the module reported; empty when it failed outright. */
  needs: string[];
}

export function spaceSetupNotices(
  mounted: readonly SpaceMountSetupResult[] | undefined,
  moduleNameById: ReadonlyMap<string, string>
): SpaceSetupNotice[] {
  return (mounted ?? [])
    .filter((entry) => !entry.ready)
    .map((entry) => ({
      error: entry.error ?? null,
      moduleId: entry.module_id,
      moduleName: moduleNameById.get(entry.module_id) ?? entry.module_id,
      needs: entry.needs,
    }));
}
