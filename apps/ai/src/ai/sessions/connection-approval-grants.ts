import {
  EngentyCoreClient,
  getEngentyCoreBaseUrlFromEnv,
} from "../core-http-client.js";

/**
 * Connection-level "always allow" grants from the connections module. Users
 * configure these durably (Settings → Connections); merging them into the
 * run's approval grants keeps the chat pre-gate from suspending on actions the
 * user already allowed. Fail-open to []: the connections module may not be
 * installed, and a missing grant only means one extra Approve card.
 */
export async function loadConnectionApprovalGrants(params: {
  userAccessToken?: string | null;
}): Promise<string[]> {
  const token = params.userAccessToken?.trim();
  const coreBaseUrl = getEngentyCoreBaseUrlFromEnv();
  if (!(token && coreBaseUrl)) {
    return [];
  }
  try {
    const client = new EngentyCoreClient({
      coreBaseUrl,
      userAccessToken: token,
    });
    const result = await client.invokeTool<
      Record<string, never>,
      { data?: { operation_ids?: string[] } } & { operation_ids?: string[] }
    >("connections_granted_operations", {});
    // Invoke responses arrive {data}-enveloped; tolerate both shapes.
    const ids = result?.data?.operation_ids ?? result?.operation_ids ?? [];
    return ids.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

/** Merge helper preserving order and uniqueness. */
export function mergeApprovalGrants(
  base: readonly string[],
  extra: readonly string[]
): string[] {
  return [...new Set([...base, ...extra])];
}
