import type { PluginAuthContext } from "@engenty/plugin-sdk";
import type { createTimeTrackingRepoSupabase } from "../dal/supabase.js";
import type { TimeEntry, TimeEntryListFilters } from "../schema/types.js";

type Repo = ReturnType<typeof createTimeTrackingRepoSupabase>;

export async function resolveTimeTrackingListUserIds(
  repo: Repo,
  auth: PluginAuthContext | undefined,
  requestedUserIds: string[] | undefined
): Promise<string[] | undefined> {
  const principalId = auth?.principalId ?? "";
  if (!principalId) {
    throw new Error("Unauthorized");
  }
  const isAdmin = await repo.isPrincipalTenantAdmin(principalId);
  if (!isAdmin) {
    return [principalId];
  }
  if (!requestedUserIds?.length) {
    return;
  }
  return [...new Set(requestedUserIds.filter(Boolean))];
}

export async function resolveTimeTrackingEntryFilters(
  repo: Repo,
  auth: PluginAuthContext | undefined,
  input: Omit<TimeEntryListFilters, "user_ids"> & {
    user_ids?: string[];
  }
): Promise<TimeEntryListFilters> {
  const user_ids = await resolveTimeTrackingListUserIds(
    repo,
    auth,
    input.user_ids
  );
  return {
    ...input,
    ...(user_ids ? { user_ids } : {}),
    include_manual: input.include_manual ?? true,
  };
}

export async function assertTimeTrackingEntryWriteAccess(
  repo: Repo,
  auth: PluginAuthContext | undefined,
  entry: TimeEntry | null
): Promise<TimeEntry> {
  if (!entry) {
    throw new Error("time_entry_not_found");
  }
  const principalId = auth?.principalId ?? "";
  if (!principalId) {
    throw new Error("Unauthorized");
  }
  if (entry.user_id === principalId) {
    return entry;
  }
  const isAdmin = await repo.isPrincipalTenantAdmin(principalId);
  if (!isAdmin) {
    throw new Error("Forbidden");
  }
  return entry;
}
