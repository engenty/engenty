/**
 * How far a space reaches, for the chat surfaces that state who reads a desk
 * or a room open to the space: everyone in the tenant (open), the people
 * added to it (private), or one person (personal). The people count comes
 * from the same rows the People section shows, so the two never disagree.
 */
import type { ChatSpaceAudience } from "@engenty/ai-ui";
import { useMemo } from "react";
import { isPersonalSpace, type Space } from "./api/spaces-client";
import { useSpacePeople } from "./use-space-people";

export function useSpaceAudience(
  space: Space | null | undefined
): ChatSpaceAudience | null {
  const people = useSpacePeople(space);
  return useMemo(
    () =>
      space
        ? {
            peopleCount: people.length,
            personal: isPersonalSpace(space),
            visibility: space.visibility,
          }
        : null,
    [people.length, space]
  );
}
