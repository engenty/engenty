import {
  isUnresolvedSpaceGate,
  type SpaceGateContext,
} from "../../../ai/tools/engenty-tools/lib/space-gate.js";

/**
 * The Space a delegated child may run in, given the validated parent/task
 * Space. Narrowing is allowed; broadening is not.
 *
 * - An unresolved parent stays unresolved — never degrades to tenant-global.
 * - A resolved parent Space is the ceiling: the child cannot drop to global
 *   or switch to a different Space.
 * - A global parent may stay global or narrow to a specific Space.
 */
export function inheritChildSpace(input: {
  parent: SpaceGateContext | null | undefined;
  requested?: SpaceGateContext | null;
}): SpaceGateContext | null {
  const parent = input.parent ?? null;
  const requested =
    input.requested === undefined ? parent : (input.requested ?? null);

  if (isUnresolvedSpaceGate(parent)) {
    return parent;
  }

  if (parent) {
    if (isUnresolvedSpaceGate(requested)) {
      return requested;
    }
    if (!requested || requested.spaceId !== parent.spaceId) {
      return parent;
    }
    return requested;
  }

  return requested;
}
