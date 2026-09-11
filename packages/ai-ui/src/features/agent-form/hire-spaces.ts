// Spaces the hire form can mount onto. Fetched from core (`GET /api/spaces`);
// the desk URL is duplicated here so ai-ui does not import apps/ui.

import { requestApiJson } from "@engenty/api-client";

export interface HireSpaceOption {
  id: string;
  key: string;
  name: string;
}

export function listHireSpaces(signal?: AbortSignal) {
  return requestApiJson<HireSpaceOption[]>("/api/spaces", { signal });
}

export function spaceAgentDeskPath(spaceKey: string, agentId: string): string {
  const key = encodeURIComponent(spaceKey);
  const id = encodeURIComponent(agentId);
  return `/s/${key}/agents/${id}`;
}

export function spaceRootPath(spaceKey: string): string {
  return `/s/${encodeURIComponent(spaceKey)}`;
}

/** First successfully mounted space's desk, or null when every mount failed. */
export function firstSuccessfulDeskPath(
  mounted: ReadonlyArray<{ ok: boolean; spaceId: string }>,
  spaces: ReadonlyArray<{ id: string; key: string }>,
  agentId: string
): string | null {
  const first = mounted.find((row) => row.ok);
  if (!first) {
    return null;
  }
  const space = spaces.find((candidate) => candidate.id === first.spaceId);
  if (!space) {
    return null;
  }
  return spaceAgentDeskPath(space.key, agentId);
}
