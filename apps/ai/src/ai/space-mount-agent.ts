// Mount a hired/approved agent onto one or more spaces. Shared by the
// registry create and approve routes so those two cannot drift on the
// resource_type / resource_key shape core expects.

import {
  type EngentyCoreClient,
  EngentyCoreHttpError,
} from "./core-http-client.js";

export interface AgentSpaceMountResult {
  error?: string;
  ok: boolean;
  spaceId: string;
}

export async function mountAgentOnSpaces(
  core: Pick<EngentyCoreClient, "putSpaceMount">,
  agentId: string,
  spaceIds: readonly string[],
  options: {
    /** The agent this one reports to in each of those spaces. */
    reportsTo?: string | null;
  } = {}
): Promise<AgentSpaceMountResult[]> {
  const unique = [...new Set(spaceIds.map((id) => id.trim()).filter(Boolean))];
  const results: AgentSpaceMountResult[] = [];
  for (const spaceId of unique) {
    try {
      await core.putSpaceMount(spaceId, {
        resource_key: agentId,
        resource_type: "agent",
        ...(options.reportsTo === undefined
          ? {}
          : { reports_to: options.reportsTo }),
      });
      results.push({ ok: true, spaceId });
    } catch (error) {
      const message =
        error instanceof EngentyCoreHttpError
          ? error.message
          : error instanceof Error
            ? error.message
            : "space_mount_failed";
      results.push({ error: message, ok: false, spaceId });
    }
  }
  return results;
}
