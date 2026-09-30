/**
 * How far a space reaches, for the chat surfaces that state who reads a desk
 * or a room open to the space: everyone in the tenant (open) or the people
 * added to it (private). The people count comes
 * from the same rows the People section shows, so the two never disagree.
 */
import type { ChatSpaceAudience } from "@engenty/ai-ui";
import { useMemo } from "react";
import type { Space } from "./api/spaces-client";
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
            visibility: space.visibility,
          }
        : null,
    [people.length, space]
  );
}
