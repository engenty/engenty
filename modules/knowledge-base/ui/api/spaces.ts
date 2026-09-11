/**
 * The spaces a knowledge base can belong to.
 *
 * A knowledge base lives in exactly one space (`space_id`, `not null` since
 * PLAN-spaces Phase 6b), so every list and every form that shows a KB has to be
 * able to name that space. Read from core's own `/api/spaces` rather than
 * mirrored into this module: the module needs the name for display, not a copy
 * of the concept.
 */

import { requestApiJson } from "@engenty/api-client";
import { queryOptions } from "@engenty/query-client";

export interface KbSpaceRef {
  id: string;
  key: string;
  name: string;
}

export async function listSpacesForKb(
  signal?: AbortSignal
): Promise<KbSpaceRef[]> {
  const spaces = await requestApiJson<KbSpaceRef[]>("/api/spaces", {
    method: "GET",
    signal,
  });
  return Array.isArray(spaces) ? spaces : [];
}

export const kbSpacesQueryOptions = queryOptions({
  queryFn: ({ signal }) => listSpacesForKb(signal),
  queryKey: ["kb", "spaces"] as const,
  // Spaces change when someone creates one, which is rare and never mid-form.
  staleTime: 60_000,
});
