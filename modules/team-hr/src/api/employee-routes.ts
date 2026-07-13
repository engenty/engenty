import type { PluginAuthContext, PluginServerApi } from "@engenty/plugin-sdk";
import { createEmployeesRepo } from "../dal/employees-supabase.js";
import { employeePatchSchema } from "../schema/employee.js";

function getRepo(supabase: unknown, auth?: PluginAuthContext) {
  if (!auth?.tenantId) {
    throw new Error("Tenant required");
  }
  return createEmployeesRepo(
    supabase,
    auth.tenantId,
    auth.scopeId || "default"
  );
}

/**
 * Employee (HR) read/write for a team member, keyed by the member's profile id.
 * team-hr owns this surface; core team's member API is profile-only.
 */
export function registerEmployeeRoutes(
  server: Pick<PluginServerApi, "registerHttpRoute">,
  supabase: unknown
) {
  server.registerHttpRoute({
    method: "get",
    path: "/api/team/:id/employee",
    operation: {
      moduleId: "team-hr",
      requiredCapabilities: ["module.team-hr.read"],
      riskLevel: "low",
      idempotent: true,
    },
    summary: "Get a team member's employee (HR) record",
    tags: ["team-hr"],
    handler: async (ctx) => {
      const repo = getRepo(supabase, ctx.auth);
      return await repo.getByProfileId((ctx.params as { id: string }).id);
    },
  });

  server.registerHttpRoute({
    method: "patch",
    path: "/api/team/:id/employee",
    operation: {
      moduleId: "team-hr",
      requiredCapabilities: ["module.team-hr.write"],
      riskLevel: "medium",
      idempotent: false,
    },
    summary: "Update a team member's employee (HR) record",
    tags: ["team-hr"],
    request: { body: employeePatchSchema },
    handler: async (ctx) => {
      const repo = getRepo(supabase, ctx.auth);
      const patch = employeePatchSchema.parse(await ctx.request.json());
      return await repo.upsertByProfileId(
        (ctx.params as { id: string }).id,
        patch
      );
    },
  });
}
