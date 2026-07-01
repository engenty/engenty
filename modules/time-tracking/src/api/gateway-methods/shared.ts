import type { PluginAuthContext, PluginServerApi } from "@engenty/plugin-sdk";
import type { createTimeTrackingRepoSupabase } from "../dal/supabase.js";

export type TimeTrackingRepo = ReturnType<
  typeof createTimeTrackingRepoSupabase
>;
export type TimeTrackingRepoOrFactory =
  | TimeTrackingRepo
  | ((auth: PluginAuthContext) => TimeTrackingRepo);

export interface TimeTrackingGatewayDeps {
  hasOperation: PluginServerApi["hasOperation"];
  invokeOperation: (
    operationId: string,
    input: unknown,
    options?: { auth?: PluginAuthContext }
  ) => Promise<unknown>;
}

export function getTimeTrackingRepo(
  repoOrFactory: TimeTrackingRepoOrFactory,
  auth?: PluginAuthContext
): TimeTrackingRepo {
  if (typeof repoOrFactory === "function") {
    if (!auth) {
      throw new Error("Auth context required");
    }
    return repoOrFactory(auth);
  }
  return repoOrFactory;
}

export const TEAM_TIME_TRACKING_LIST = "team_time_tracking_list_catalog";
export const TEAM_TIME_TRACKING_ACTOR =
  "team_time_tracking_actor_for_principal";

export function teamMembersTimeTrackingBridgeAvailable(
  deps: Pick<TimeTrackingGatewayDeps, "hasOperation">
): boolean {
  return (
    deps.hasOperation(TEAM_TIME_TRACKING_LIST) &&
    deps.hasOperation(TEAM_TIME_TRACKING_ACTOR)
  );
}

export function operationError(
  code: string,
  message: string,
  status = 400
): Response {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function mapEntryAccessError(error: unknown): Response | null {
  if (!(error instanceof Error)) {
    return null;
  }
  if (error.message === "time_entry_not_found") {
    return operationError("time_entry_not_found", "Entry not found", 404);
  }
  if (error.message === "Forbidden") {
    return operationError("forbidden", "Forbidden", 403);
  }
  if (error.message === "Unauthorized") {
    return operationError("unauthorized", "Unauthorized", 401);
  }
  return null;
}
