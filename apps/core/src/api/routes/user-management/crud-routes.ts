import { apiSuccessSchema } from "@engenty/api-contracts";
import { createRoute, z } from "@hono/zod-openapi";
import type { CoreUser } from "../../../dal/core-users/types.js";
import { recordCoreAuditEvent } from "../../../security/audit-service.js";
import { jsonApiError, jsonApiSuccess } from "../api-response.js";
import {
  CoreUserSchema,
  CreateUserBodySchema,
  ErrorSchema,
  hasManageCapability,
  readBearer,
  resolveCoreTokenAuth,
  resolveTenantForSessionToken,
  toCoreUserWire,
  UpdateUserBodySchema,
  type UserManagementRouteParams,
  UserParamsSchema,
} from "./shared.js";

export function registerUserManagementCrudRoutes(
  params: UserManagementRouteParams
) {
  /**
   * Readable by any member of the tenant, and that stays deliberate.
   *
   * This is the internal staff directory: the copilot's `@`-mention picker and
   * the team module's "connect an existing user" modals are member-facing and
   * read it, so admin-gating the route would break the colleague lookup for
   * exactly the people who need it. What made the open access a problem was the
   * payload, not the audience — the DAL's `select("*")` shipped `private_phone`,
   * `private_address` and `emergency_contact` along with the name and the email.
   *
   * That is fixed at the source (`CORE_USER_COLUMNS` in the core-users DAL) and
   * again on the way out (`toCoreUserWire`), so what a member can read here is
   * work-contact data: name, email, role, work phone, initials. Anything more
   * private than that must not be added to `CoreUserSchema` — put it behind an
   * admin-gated route, the way the HR surface does.
   */
  const listUsersRoute = createRoute({
    method: "get",
    path: "/api/users",
    tags: ["users"],
    summary: "List users in current tenant",
    responses: {
      200: {
        description: "Users list",
        content: {
          "application/json": {
            schema: apiSuccessSchema(z.array(CoreUserSchema)),
          },
        },
      },
      401: {
        description: "Unauthorized",
        content: { "application/json": { schema: ErrorSchema } },
      },
      403: {
        description: "Tenant not resolved",
        content: { "application/json": { schema: ErrorSchema } },
      },
      500: {
        description: "Configuration error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  });
  (params.app as any).openapi(listUsersRoute, async (c: any) => {
    let dal;
    try {
      dal = params.getDal();
    } catch (error) {
      return jsonApiError(c, 500, {
        message:
          error instanceof Error ? error.message : "Configuration error.",
      });
    }
    const token = readBearer(c);
    if (!token) {
      return jsonApiError(c, 401, { message: "Unauthorized" });
    }
    const tenantId = await resolveTenantForSessionToken(dal, token);
    if (!tenantId) {
      return jsonApiError(c, 403, {
        message: "User not yet onboarded to a tenant.",
      });
    }
    const users = await dal.listUsers(tenantId);
    return jsonApiSuccess(c, users.map(toCoreUserWire));
  });

  /**
   * The member-facing directory: everyone in the tenant, as a name and an id.
   *
   * Exists because a picker ("who can I add to this space?") must be usable by
   * someone who is not an admin — sharing a personal space is done by naming a
   * person, and its owner is usually an ordinary member. `/api/users` cannot
   * serve that: it is `select("*")`, so it hands back private phone numbers and
   * home addresses to render a dropdown.
   *
   * **Registered BEFORE `/api/users/:id`, and that is load-bearing.** First
   * match wins, so with the order reversed `directory` is read as a user id and
   * this route silently 404s — the same shadowing trap that bit cross-module
   * routes before (see the `cross-module-route-shadowing` note).
   */
  const listDirectoryRoute = createRoute({
    method: "get",
    path: "/api/users/directory",
    tags: ["users"],
    summary: "Tenant directory (id + name only) — readable by any member",
    responses: {
      200: {
        description: "Directory",
        content: {
          "application/json": {
            schema: apiSuccessSchema(
              z.array(
                z.object({
                  displayName: z.string().nullable(),
                  email: z.string(),
                  id: z.string(),
                })
              )
            ),
          },
        },
      },
      401: {
        description: "Unauthorized",
        content: { "application/json": { schema: ErrorSchema } },
      },
      403: {
        description: "Tenant not resolved",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  });
  (params.app as any).openapi(listDirectoryRoute, async (c: any) => {
    let dal: ReturnType<typeof params.getDal>;
    try {
      dal = params.getDal();
    } catch (error) {
      return jsonApiError(c, 500, {
        message:
          error instanceof Error ? error.message : "Configuration error.",
      });
    }
    const token = readBearer(c);
    if (!token) {
      return jsonApiError(c, 401, { message: "Unauthorized" });
    }
    const tenantId = await resolveTenantForSessionToken(dal, token);
    if (!tenantId) {
      return jsonApiError(c, 403, {
        message: "User not yet onboarded to a tenant.",
      });
    }
    return jsonApiSuccess(c, await dal.listUserDirectory(tenantId));
  });

  const getUserRoute = createRoute({
    method: "get",
    path: "/api/users/:id",
    tags: ["users"],
    summary: "Get user by id in current tenant",
    request: { params: UserParamsSchema },
    responses: {
      200: {
        description: "User",
        content: {
          "application/json": { schema: apiSuccessSchema(CoreUserSchema) },
        },
      },
      401: {
        description: "Unauthorized",
        content: { "application/json": { schema: ErrorSchema } },
      },
      403: {
        description: "Forbidden",
        content: { "application/json": { schema: ErrorSchema } },
      },
      404: {
        description: "Not found",
        content: { "application/json": { schema: ErrorSchema } },
      },
      500: {
        description: "Configuration error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  });
  (params.app as any).openapi(getUserRoute, async (c: any) => {
    let dal;
    try {
      dal = params.getDal();
    } catch (error) {
      return jsonApiError(c, 500, {
        message:
          error instanceof Error ? error.message : "Configuration error.",
      });
    }
    const token = readBearer(c);
    if (!token) {
      return jsonApiError(c, 401, { message: "Unauthorized" });
    }
    const authUser = await dal.resolveAuthUser(token);
    const tenantId = await dal.getTenantIdForAuthUser(token);
    if (!tenantId) {
      return jsonApiError(c, 403, {
        message: "User not yet onboarded to a tenant.",
      });
    }
    const isAdmin = await dal.isAuthUserAdmin(token);
    const { id } = c.req.valid("param");
    const effectiveId = id === "u-self" ? authUser.id : id;
    if (!isAdmin && authUser.id !== effectiveId) {
      return jsonApiError(c, 403, { message: "Forbidden" });
    }
    const user = await dal.getUserById(effectiveId, tenantId);
    if (!user) {
      return jsonApiError(c, 404, { message: "User not found" });
    }
    return jsonApiSuccess(c, toCoreUserWire(user));
  });

  const patchUserRoute = createRoute({
    method: "patch",
    path: "/api/users/:id",
    tags: ["users"],
    summary: "Update user profile in tenant",
    request: {
      params: UserParamsSchema,
      body: {
        content: { "application/json": { schema: UpdateUserBodySchema } },
      },
    },
    responses: {
      200: {
        description: "Updated user",
        content: {
          "application/json": { schema: apiSuccessSchema(CoreUserSchema) },
        },
      },
      400: {
        description: "Invalid body",
        content: { "application/json": { schema: ErrorSchema } },
      },
      401: {
        description: "Unauthorized",
        content: { "application/json": { schema: ErrorSchema } },
      },
      403: {
        description: "Forbidden",
        content: { "application/json": { schema: ErrorSchema } },
      },
      500: {
        description: "Configuration error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  });
  (params.app as any).openapi(patchUserRoute, async (c: any) => {
    let dal;
    try {
      dal = params.getDal();
    } catch (error) {
      return jsonApiError(c, 500, {
        message:
          error instanceof Error ? error.message : "Configuration error.",
      });
    }
    const token = readBearer(c);
    if (!token) {
      return jsonApiError(c, 401, { message: "Unauthorized" });
    }
    const authUser = await dal.resolveAuthUser(token);
    const tenantId = await dal.getTenantIdForAuthUser(token);
    if (!tenantId) {
      return jsonApiError(c, 403, {
        message: "User not yet onboarded to a tenant.",
      });
    }
    const { id } = c.req.valid("param");
    const effectiveId = id === "u-self" ? authUser.id : id;
    const isAdmin = await dal.isAuthUserAdmin(token);
    const coreTokenAuth = await resolveCoreTokenAuth(c, params.config);
    const payload = c.req.valid("json");
    const isRoleChange = typeof payload.role === "string";
    if (isRoleChange && !(isAdmin || hasManageCapability(coreTokenAuth))) {
      return jsonApiError(c, 403, { message: "Forbidden" });
    }
    if (
      !(
        isAdmin ||
        authUser.id === effectiveId ||
        hasManageCapability(coreTokenAuth)
      )
    ) {
      return jsonApiError(c, 403, { message: "Forbidden" });
    }

    if (typeof payload.password === "string") {
      if (effectiveId === authUser.id) {
        return jsonApiError(c, 400, {
          message:
            "Use the account password dialog to change your own password.",
        });
      }
      if (!(isAdmin || hasManageCapability(coreTokenAuth))) {
        return jsonApiError(c, 403, { message: "Forbidden" });
      }
      await dal.updateUserPassword(effectiveId, tenantId, payload.password);
    }

    const hasProfileFields =
      payload.email !== undefined ||
      payload.display_name !== undefined ||
      payload.phone !== undefined ||
      payload.initials !== undefined ||
      payload.role !== undefined;

    if (!(hasProfileFields || typeof payload.password === "string")) {
      return jsonApiError(c, 400, { message: "No fields to update." });
    }

    let user: CoreUser;
    if (hasProfileFields) {
      user = await dal.updateUser(effectiveId, tenantId, {
        email: payload.email,
        display_name: payload.display_name,
        phone: payload.phone,
        initials: payload.initials,
        role: payload.role,
      });
    } else {
      const existing = await dal.getUserById(effectiveId, tenantId);
      if (!existing) {
        return jsonApiError(c, 404, { message: "User not found" });
      }
      user = existing;
    }
    if (params.auditLog) {
      recordCoreAuditEvent(
        params.auditLog,
        {
          type: "user_management.user.updated",
          actorId: authUser.id,
          tenantId,
          moduleId: "user-management",
          operationId: "users_patch",
          detail: { user_id: effectiveId, display_name: user.display_name },
        },
        { component: "user-management-crud" }
      );
    }
    return jsonApiSuccess(c, toCoreUserWire(user));
  });

  const createUserRoute = createRoute({
    method: "post",
    path: "/api/users",
    tags: ["users"],
    summary: "Create user in current tenant",
    request: {
      body: {
        content: { "application/json": { schema: CreateUserBodySchema } },
      },
    },
    responses: {
      200: {
        description: "Created user",
        content: {
          "application/json": {
            schema: apiSuccessSchema(CoreUserSchema),
          },
        },
      },
      400: {
        description: "Invalid body",
        content: { "application/json": { schema: ErrorSchema } },
      },
      401: {
        description: "Unauthorized",
        content: { "application/json": { schema: ErrorSchema } },
      },
      403: {
        description: "Forbidden",
        content: { "application/json": { schema: ErrorSchema } },
      },
      500: {
        description: "Configuration error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  });
  (params.app as any).openapi(createUserRoute, async (c: any) => {
    let dal;
    try {
      dal = params.getDal();
    } catch (error) {
      return jsonApiError(c, 500, {
        message:
          error instanceof Error ? error.message : "Configuration error.",
      });
    }
    const token = readBearer(c);
    if (!token) {
      return jsonApiError(c, 401, { message: "Unauthorized" });
    }
    const tenantId = await dal.getTenantIdForAuthUser(token);
    if (!tenantId) {
      return jsonApiError(c, 403, {
        message: "User not yet onboarded to a tenant.",
      });
    }
    const isAdmin = await dal.isAuthUserAdmin(token);
    const coreTokenAuth = await resolveCoreTokenAuth(c, params.config);
    if (!(isAdmin || hasManageCapability(coreTokenAuth))) {
      return jsonApiError(c, 403, { message: "Forbidden" });
    }
    const payload = c.req.valid("json");
    const user = await dal.createUser(tenantId, {
      email: payload.email,
      password: payload.password,
      display_name: payload.display_name,
      role: payload.role ?? "member",
      phone: payload.phone,
    });
    const authUser = await dal.resolveAuthUser(token);
    if (params.auditLog) {
      recordCoreAuditEvent(
        params.auditLog,
        {
          type: "user_management.user.created",
          actorId: authUser.id,
          tenantId,
          moduleId: "user-management",
          operationId: "users_post",
          detail: {
            user_id: user.id,
            display_name: user.display_name,
            email: user.email,
          },
        },
        { component: "user-management-crud" }
      );
    }
    return jsonApiSuccess(c, toCoreUserWire(user));
  });

  const deleteUserRoute = createRoute({
    method: "delete",
    path: "/api/users/:id",
    tags: ["users"],
    summary: "Delete user in current tenant",
    request: { params: UserParamsSchema },
    responses: {
      200: {
        description: "Deleted",
        content: {
          "application/json": {
            schema: apiSuccessSchema(z.object({ deleted: z.boolean() })),
          },
        },
      },
      401: {
        description: "Unauthorized",
        content: { "application/json": { schema: ErrorSchema } },
      },
      403: {
        description: "Forbidden",
        content: { "application/json": { schema: ErrorSchema } },
      },
      500: {
        description: "Configuration error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  });
  (params.app as any).openapi(deleteUserRoute, async (c: any) => {
    let dal;
    try {
      dal = params.getDal();
    } catch (error) {
      return jsonApiError(c, 500, {
        message:
          error instanceof Error ? error.message : "Configuration error.",
      });
    }
    const token = readBearer(c);
    if (!token) {
      return jsonApiError(c, 401, { message: "Unauthorized" });
    }
    const authUser = await dal.resolveAuthUser(token);
    const tenantId = await dal.getTenantIdForAuthUser(token);
    if (!tenantId) {
      return jsonApiError(c, 403, {
        message: "User not yet onboarded to a tenant.",
      });
    }
    const isAdmin = await dal.isAuthUserAdmin(token);
    const coreTokenAuth = await resolveCoreTokenAuth(c, params.config);
    if (!(isAdmin || hasManageCapability(coreTokenAuth))) {
      return jsonApiError(c, 403, { message: "Forbidden" });
    }
    const { id } = c.req.valid("param");
    const deletedUser = await dal.getUserById(id, tenantId);
    await dal.deleteUser(id, tenantId);
    if (params.auditLog) {
      recordCoreAuditEvent(
        params.auditLog,
        {
          type: "user_management.user.deleted",
          actorId: authUser.id,
          tenantId,
          moduleId: "user-management",
          operationId: "users_delete",
          detail: {
            user_id: id,
            display_name: deletedUser?.display_name ?? null,
          },
        },
        { component: "user-management-crud" }
      );
    }
    return jsonApiSuccess(c, { deleted: true });
  });
}
