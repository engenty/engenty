/**
 * Which space a chat belongs to (PLAN-spaces.md Phase C2).
 *
 * Chat is a per-space surface: in a space you see that space's chats, and the
 * space decides what the copilot can reach. So every thread needs a space, and
 * every surface that can open a chat needs an answer — including the drawer,
 * which opens on top of pages that are not space routes at all (a global module,
 * `/settings/*`, the setup screens).
 *
 * The answer outside a space is the PERSONAL space, not the tenant default.
 * The personal desk is `/mdl/engenty-copilot`; that URL files new threads into
 * the personal space so every chat still has a `space_id`. The default space
 * is Company, shared with everyone, and quietly filing a colleague-free thought
 * there is the kind of surprise nobody reports as a bug.
 *
 * Deliberately NOT `useRouteSpace`: that one falls back to the tenant default
 * outside `/s/…`, which is right for modules building storage paths (they must
 * have *a* space) and wrong here for exactly the reason above.
 */
// Relative, not the `@/` alias: this module is unit-tested, and vitest runs
// with the repo root as its root, where that alias does not resolve.
import { parseSpacePath } from "../lib/space-routes";

export interface CopilotSpaceCandidate {
  id: string;
  isPersonal: boolean;
  key: string;
}

/**
 * The viewer's personal space KEY, for building a real URL.
 *
 * Not `/s/me`: that alias only survives where no deeper route out-ranks it, and
 * React Router ranks by specificity rather than declaration order. Once the
 * copilot is mirrored into spaces, `/s/me/engenty-copilot/chat/:threadId`
 * matches `/s/:spaceKey/…` — with `spaceKey = "me"`, a key no space has — so
 * `PersonalSpaceRedirect` never runs and the shell resolves the tenant default
 * instead. Silent, and exactly the wrong-space landing this phase exists to
 * prevent. Anything emitting a deep link resolves the key itself.
 */
export function personalSpaceKey(
  spaces: readonly CopilotSpaceCandidate[]
): string | null {
  return spaces.find((space) => space.isPersonal)?.key ?? null;
}

export function resolveCopilotSpaceId(input: {
  pathname: string;
  spaces: readonly CopilotSpaceCandidate[];
}): string | null {
  const spaceKey = parseSpacePath(input.pathname)?.spaceKey ?? null;
  if (spaceKey) {
    const match = input.spaces.find((space) => space.key === spaceKey);
    if (match) {
      return match.id;
    }
    // An unknown key — a deleted space, a typo, another tenant's link. Fall
    // through to the personal space rather than returning null: a thread with
    // no space shows only under "All spaces", which reads as the chat having
    // vanished.
  }
  return input.spaces.find((space) => space.isPersonal)?.id ?? null;
}
