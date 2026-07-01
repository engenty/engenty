/**
 * Resolve tenant user display for article attribution (GET /api/users/:id).
 */

import { requestApiJson } from "@engenty/api-client";

export interface TenantUserBrief {
  display_name: string | null;
  email: string;
  id: string;
}

export async function getTenantUserBrief(
  userId: string,
  signal?: AbortSignal
): Promise<TenantUserBrief | null> {
  try {
    return await requestApiJson<TenantUserBrief>(
      `/api/users/${encodeURIComponent(userId)}`,
      { method: "GET", signal }
    );
  } catch {
    return null;
  }
}
