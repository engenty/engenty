/**
 * Spaces the thread list can name when grouping chats (PLAN-spaces.md).
 *
 * Read from core's `/api/spaces` — the module needs names and ids for display,
 * not a copy of the concept. Query key matches the host so the rail's cache
 * is reused.
 */

import { requestApiJson } from "@engenty/api-client";
import { queryOptions } from "@engenty/query-client";

export interface CopilotSpaceRef {
  id: string;
  key: string;
  name: string;
  ownerUserId: string | null;
}

export async function listCopilotSpaces(
  signal?: AbortSignal
): Promise<CopilotSpaceRef[]> {
  const spaces = await requestApiJson<CopilotSpaceRef[]>("/api/spaces", {
    method: "GET",
    signal,
  });
  return Array.isArray(spaces) ? spaces : [];
}

export const copilotSpacesQueryOptions = queryOptions({
  queryFn: ({ signal }) => listCopilotSpaces(signal),
  queryKey: ["spaces", "list"] as const,
  staleTime: 60_000,
});

/** Personal first, then the rest by name — the desk's own space leads. */
export function copilotSpaceOrder(
  spaces: readonly CopilotSpaceRef[]
): string[] {
  const personal: CopilotSpaceRef[] = [];
  const rest: CopilotSpaceRef[] = [];
  for (const space of spaces) {
    if (space.ownerUserId) {
      personal.push(space);
    } else {
      rest.push(space);
    }
  }
  rest.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: "base",
    })
  );
  return [...personal, ...rest].map((space) => space.id);
}
