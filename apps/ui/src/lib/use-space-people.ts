/**
 * The people of a space: its `core.space_member` rows, mapped to what a picker
 * needs. One source for every surface that asks "who is here?" — the People
 * section, the room bar's add-someone picker and the composer's `@` list.
 *
 * A space starts with its creator's row (core writes it on create) and grows by
 * invitation. Openness is not membership: `visibility = 'open'` says anyone in
 * the tenant MAY enter, not that they are in it, so it adds nobody here. A
 * personal space has no rows at all — `core.forbid_personal_space_member` — and
 * its owner is the only person in it, which is the one thing you never need a
 * picker for.
 */
import { useMemo } from "react";
import type { Space } from "./api/spaces-client";
import { useSpaceMembersQuery } from "./spaces-queries";

export interface SpacePerson {
  email: string | null;
  id: string;
  name: string;
}

export function useSpacePeople(space: Space | null | undefined): SpacePerson[] {
  // A personal space forbids member rows; do not ask for a roster the database
  // refuses to hold.
  const isPersonal = Boolean(space?.ownerUserId);
  const membersQuery = useSpaceMembersQuery(
    space && !isPersonal ? space.id : null
  );
  const members = membersQuery.data;

  return useMemo(
    () =>
      (members ?? []).map((member) => ({
        email: member.email,
        id: member.userId,
        name: member.displayName || member.email || member.userId,
      })),
    [members]
  );
}
