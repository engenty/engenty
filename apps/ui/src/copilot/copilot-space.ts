/**
 * Which space a copilot TURN happens in, read off the URL.
 *
 * The river is one thread, so nothing here files a thread anywhere. The space
 * stamps the turn (apps/ai turn-context.ts): it is what cuts the river into
 * chapters and what a run reaches its tools through. Outside `/s/…` the answer
 * is null — "everywhere" — and so is an unknown key: a deleted space, a typo,
 * another tenant's link. Guessing a space for a turn would file it under a
 * chapter the person never stood in.
 *
 * Deliberately NOT `useRouteSpace`: that one falls back to the tenant default
 * outside `/s/…`, right for modules building storage paths, wrong here.
 */
// Relative, not the `@/` alias: this module is unit-tested, and vitest runs
// with the repo root as its root, where that alias does not resolve.
import { parseSpacePath } from "../lib/space-routes";

export interface CopilotSpaceCandidate {
  id: string;
  key: string;
}

export function resolveCopilotSpaceId(input: {
  pathname: string;
  spaces: readonly CopilotSpaceCandidate[];
}): string | null {
  const spaceKey = parseSpacePath(input.pathname)?.spaceKey ?? null;
  if (!spaceKey) {
    return null;
  }
  return input.spaces.find((space) => space.key === spaceKey)?.id ?? null;
}
