import { apiErrorResponseSchema } from "@engenty/api-contracts";
import { capabilityCovers } from "@engenty/plugin-sdk";
import { type OpenAPIHono, z } from "@hono/zod-openapi";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CoreUser } from "../../../dal/core-users/types.js";
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
  /**
   * What the first-run readiness gate needs beyond the users DAL: the
   * installed module ids (null without a registry) and a service-role client
   * for the schema probes. Optional so the CRUD tests keep their small setup.
   */
  setupChecks?: SetupChecksContext;
}

export interface SetupChecksContext {
  getServiceClient: () => SupabaseClient | null;
  installedModuleIds: () => readonly string[] | null;
  /** The server lane's boot probe, or null when the lane is not configured. */
  serverLanePreflight?: () => (() => Promise<void>) | null;
}

interface CoreAuthLike {
  capabilities: string[];
  principalType: "user" | "agent" | "service";
}

export const TenantRoleSchema = z.enum(["admin", "member"]);
/**
 * `tenantRole` as reported by workspace context. Wider than
 * {@link TenantRoleSchema} because a service principal has no membership row —
 * `"service"` never appears in `core.user_tenant_roles`, only here.
 */
export const WorkspaceRoleSchema = z.enum(["admin", "member", "service"]);
export const GlobalRoleSchema = z.enum(["superadmin"]);

export const ErrorSchema = apiErrorResponseSchema;
export const SetupStatusSchema = z.object({
  initialSetupRequired: z.boolean(),
  usersCount: z.number(),
});
export const ResolvedAppearanceSchema = z.object({
  chatStyle: z.string(),
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
  /**
   * The principal's capability bundle — the same ids `capabilityCovers`
   * matches everywhere else. This endpoint is apps/ai's policy feed (AUTH-06):
   * it already returns the admin booleans that apps/ai gates on, so it carries
   * the finer-grained truth too rather than leaving apps/ai to guess from the
   * booleans. Users get the base role bundle (no DB role assignments); service
   * principals get their token's own claims.
   */
  capabilities: z.array(z.string()),
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
  /** Commercial package label, or "local" when none is assigned. */
  planLabel: z.string(),
  resolvedAppearance: ResolvedAppearanceSchema,
  tenantRole: WorkspaceRoleSchema.nullable(),
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
const CORE_USER_WIRE_KEYS = Object.keys(CoreUserSchema.shape);

/**
 * Reduce a `core.users` row to exactly the fields {@link CoreUserSchema}
 * declares, dropping anything else.
 *
 * zod-openapi validates *requests* against the declared schemas but never
 * response bodies, so until now the declared contract was documentation rather
 * than a boundary: a `select("*")` in the DAL silently shipped `private_address`
 * and `emergency_contact` to every caller. The DAL's column list is the fix;
 * this is the wall behind it, so a wildcard reintroduced in some other adapter
 * cannot leak a column that was never part of the contract.
 *
 * Deliberately a pick rather than `CoreUserSchema.parse`: this runs on every
 * user response, and a row that fails validation for an unrelated reason (a role
 * value added ahead of the schema, say) should not turn a read into a 500.
 */
export function toCoreUserWire(user: CoreUser): Record<string, unknown> {
  // Cast because the runtime row is wider than `CoreUser` — that mismatch is the
  // whole reason this function exists, so it cannot be expressed in the input type.
  const row = user as unknown as Record<string, unknown>;
  const wire: Record<string, unknown> = {};
  for (const key of CORE_USER_WIRE_KEYS) {
    wire[key] = row[key];
  }
  return wire;
}

export const UserParamsSchema = z.object({ id: z.string().min(1) });
export const UpdateUserBodySchema = z.object({
  email: z.string().optional(),
  display_name: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  initials: z.string().nullable().optional(),
  role: TenantRoleSchema.optional(),
  /** Admin-only: set another tenant user's auth password (not for self). */
  password: z.string().min(6).optional(),
});
export const CreateUserBodySchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
  display_name: z.string().min(1),
  role: TenantRoleSchema.optional(),
  phone: z.string().nullable().optional(),
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
  // NOTE: no `principalType === "service"` shortcut. Any service token that
  // legitimately manages users must be minted with "core.users.manage" (or a
  // broader wildcard). A bare service principal must NOT be able to create
  // users or change roles just by virtue of being a service token. Uses the
  // shared matcher so `core.superadmin` / `core.*` / `*` all cover management
  // consistently with every other enforcement point.
  return capabilityCovers(auth.capabilities, "core.users.manage");
}

export async function resolveTenantForSessionToken(
  dal: CoreUsersDal,
  token: string
): Promise<string | null> {
  await dal.resolveAuthUser(token);
  return await dal.getTenantIdForAuthUser(token);
}
