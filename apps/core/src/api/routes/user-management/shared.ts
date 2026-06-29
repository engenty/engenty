import { apiErrorResponseSchema } from "@engenty/api-contracts";
import { type OpenAPIHono, z } from "@hono/zod-openapi";
import type { CoreUsersDal } from "../../../dal/core-users.js";
import type { SecurityAuditLogAdapter } from "../../../security/audit-adapter.js";
import {
  getSecuritySecret,
  verifyAccessToken,
} from "../../../security/auth.js";

export interface UserManagementRouteParams {
  app: OpenAPIHono;
  auditLog?: SecurityAuditLogAdapter;
  config: Record<string, unknown>;
  getDal: () => CoreUsersDal;
}

interface CoreAuthLike {
  capabilities: string[];
  principalType: "user" | "agent" | "service";
}

export const TenantRoleSchema = z.enum(["admin", "member"]);
export const GlobalRoleSchema = z.enum(["superadmin"]);

export const ErrorSchema = apiErrorResponseSchema;
export const SetupStatusSchema = z.object({
  initialSetupRequired: z.boolean(),
  usersCount: z.number(),
});
export const ResolvedAppearanceSchema = z.object({
  font: z.string(),
  fontSize: z.string(),
  language: z.string(),
  themeMode: z.string(),
  sidebarVisibility: z.string().optional(),
  sidebarColor: z.string().optional(),
  colorPrimary: z.string().optional(),
  colorSecondary: z.string().optional(),
  colorBackground: z.string().optional(),
  tenantContrast: z.string().optional(),
  contrast: z.string().optional(),
  colorBlind: z.string().optional(),
});
export const WorkspaceContextSchema = z.object({
  onboarded: z.boolean(),
  userId: z.string(),
  currentUser: z.object({
    id: z.string(),
    email: z.string().nullable(),
    display_name: z.string().nullable(),
    initials: z.string().nullable(),
    role: TenantRoleSchema.nullable(),
  }),
  isSuperAdmin: z.boolean(),
  isTenantAdmin: z.boolean(),
  currentTenant: z
    .object({
      id: z.string(),
      slug: z.string(),
      name: z.string(),
    })
    .nullable(),
  tenants: z.array(
    z.object({
      id: z.string(),
      slug: z.string(),
      name: z.string(),
    })
  ),
  canSwitchTenant: z.boolean(),
  resolvedAppearance: ResolvedAppearanceSchema,
  tenantRole: TenantRoleSchema.nullable(),
  tenantSupportedLocales: z.array(z.string()),
});
export const CoreUserSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  email: z.string(),
  display_name: z.string().nullable(),
  role: TenantRoleSchema,
  phone: z.string().nullable(),
  initials: z.string().nullable(),
  is_super_admin: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});
export const UserParamsSchema = z.object({ id: z.string().min(1) });
export const UpdateUserBodySchema = z.object({
  email: z.string().optional(),
  display_name: z.string().optional(),
  phone: z.string().optional(),
  initials: z.string().optional(),
  role: TenantRoleSchema.optional(),
  /** Admin-only: set another tenant user's auth password (not for self). */
  password: z.string().min(6).optional(),
});
export const CreateUserBodySchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
  display_name: z.string().min(1),
  role: TenantRoleSchema.optional(),
  phone: z.string().optional(),
});

export function readBearer(c: {
  req: { header: (name: string) => string | undefined };
}): string | null {
  const authHeader = c.req.header("authorization");
  if (!authHeader) {
    return null;
  }
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return authHeader.slice(7).trim();
}

export async function resolveCoreTokenAuth(
  c: { req: { header: (name: string) => string | undefined } },
  config: Record<string, unknown>
): Promise<CoreAuthLike | null> {
  const auth = await verifyAccessToken(
    c.req.header("authorization"),
    getSecuritySecret(config),
    { transport: "rest" }
  );
  if (!auth) {
    return null;
  }
  return {
    capabilities: auth.capabilities,
    principalType: auth.principalType,
  };
}

export function hasManageCapability(auth: CoreAuthLike | null): boolean {
  if (!auth) {
    return false;
  }
  return (
    auth.principalType === "service" ||
    auth.capabilities.includes("core.users.manage") ||
    auth.capabilities.includes("core.*") ||
    auth.capabilities.includes("*")
  );
}

export async function resolveTenantForSessionToken(
  dal: CoreUsersDal,
  token: string
): Promise<string | null> {
  await dal.resolveAuthUser(token);
  return await dal.getTenantIdForAuthUser(token);
}
