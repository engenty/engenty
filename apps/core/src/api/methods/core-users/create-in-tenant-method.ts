import type { PluginGatewayMethod } from "@engenty/plugin-sdk";
import { createCoreUsersDal } from "../../../dal/core-users.js";

export function buildCoreUsersCreateInTenantMethod(
  config: Record<string, unknown>
): PluginGatewayMethod {
  const getDal = () => createCoreUsersDal(config);
  return {
    name: "core_users_create_in_tenant",
    summary: "Create a user in the current tenant",
    operation: {
      moduleId: "core",
      operationId: "core_users_create_in_tenant",
      requiredCapabilities: ["core.users.manage"],
      riskLevel: "high",
      requiresApproval: true,
    },
    handler: async (input, ctx) => {
      const dal = getDal();
      const body = input as {
        display_name: string;
        email: string;
        password: string;
        role?: "admin" | "member";
      };
      if (!ctx.auth?.tenantId) {
        throw new Error("Tenant context required");
      }
      const user = await dal.createUser(ctx.auth.tenantId, {
        display_name: body.display_name,
        email: body.email,
        password: body.password,
        role: body.role ?? "member",
      });
      return { id: user.id };
    },
  };
}
