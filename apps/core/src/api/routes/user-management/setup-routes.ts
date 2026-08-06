import { apiSuccessSchema } from "@engenty/api-contracts";
import { createRoute, z } from "@hono/zod-openapi";
import {
  getSecuritySecret,
  verifyAccessToken,
} from "../../../security/auth.js";
import { jsonApiError } from "../api-response.js";
import {
  connectivityFailureResponse,
  jsonApiSuccessCreateInitialAdmin,
  jsonApiSuccessOrDatabaseDown,
} from "./setup-database-errors.js";
import {
  CoreUserSchema,
  ErrorSchema,
  readBearer,
  SetupStatusSchema,
  type UserManagementRouteParams,
  WorkspaceContextSchema,
} from "./shared.js";

export function registerUserManagementSetupRoutes(
  params: UserManagementRouteParams
) {
  const setupStatusRoute = createRoute({
    method: "get",
    path: "/api/users/setup/status",
    tags: ["users"],
    summary: "Get user setup status",
    responses: {
      200: {
        description: "Setup status",
        content: {
          "application/json": { schema: apiSuccessSchema(SetupStatusSchema) },
        },
      },
      500: {
        description: "Configuration error",
        content: { "application/json": { schema: ErrorSchema } },
      },
      503: {
        description: "Database unreachable",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  });
  (params.app as any).openapi(setupStatusRoute, async (c: any) => {
    let dal;
    try {
      dal = params.getDal();
    } catch (error) {
      return jsonApiError(c, 500, {
        message:
          error instanceof Error ? error.message : "Configuration error.",
      });
    }
    return jsonApiSuccessOrDatabaseDown(c, params.config, () =>
      dal.getSetupStatus()
    );
  });

  const createInitialAdminRoute = createRoute({
    method: "post",
    path: "/api/users/setup/create-initial-admin",
    tags: ["users"],
    summary: "Create initial admin (no auth; only when no users exist)",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              email: z.string().email(),
              password: z.string().min(6),
              display_name: z.string().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Created",
        content: {
          "application/json": {
            schema: apiSuccessSchema(CoreUserSchema),
          },
        },
      },
      409: {
        description: "Already initialized",
        content: { "application/json": { schema: ErrorSchema } },
      },
      500: {
        description: "Configuration error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  });
  (params.app as any).openapi(createInitialAdminRoute, async (c: any) => {
    let dal;
    try {
      dal = params.getDal();
    } catch {
      return jsonApiError(c, 500, { message: "Configuration error." });
    }
    let status;
    try {
      status = await dal.getSetupStatus();
    } catch (error) {
      const down = connectivityFailureResponse(c, params.config, error);
      if (down) {
        return down;
      }
      throw error;
    }
    if (!status.initialSetupRequired) {
      return jsonApiError(c, 409, {
        message: "Initial setup already completed.",
      });
    }
    const body = (await c.req.json()) as {
      email?: string;
      password?: string;
      display_name?: string;
    };
    const email = typeof body.email === "string" ? body.email : "";
    const password = typeof body.password === "string" ? body.password : "";
    const display_name =
      (typeof body.display_name === "string" ? body.display_name.trim() : "") ||
      email.split("@")[0] ||
      "Admin";
    if (!(email && password)) {
      return jsonApiError(c, 400, {
        message: "email and password are required.",
      });
    }
    if (password.length < 6) {
      return jsonApiError(c, 400, {
        message: "Password must be at least 6 characters.",
      });
    }
    return jsonApiSuccessCreateInitialAdmin(c, params.config, async () => {
      const created = await dal.createInitialAdmin({
        email,
        password,
        display_name,
      });
      return created.user;
    });
  });

  const initializeAdminRoute = createRoute({
    method: "post",
    path: "/api/users/setup/initialize-admin",
    tags: ["users"],
    summary: "Initialize first admin user",
    responses: {
      200: {
        description: "Initialized",
        content: {
          "application/json": {
            schema: apiSuccessSchema(CoreUserSchema),
          },
        },
      },
      401: {
        description: "Unauthorized",
        content: { "application/json": { schema: ErrorSchema } },
      },
      409: {
        description: "Already initialized",
        content: { "application/json": { schema: ErrorSchema } },
      },
      500: {
        description: "Configuration error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  });
  (params.app as any).openapi(initializeAdminRoute, async (c: any) => {
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
    let status;
    try {
      status = await dal.getSetupStatus();
    } catch (error) {
      const down = connectivityFailureResponse(c, params.config, error);
      if (down) {
        return down;
      }
      throw error;
    }
    if (!status.initialSetupRequired) {
      return jsonApiError(c, 409, {
        message: "Initial setup already completed.",
      });
    }
    return jsonApiSuccessOrDatabaseDown(c, params.config, () =>
      dal.initializeAdminForAuthUser(token).then((r) => r.user)
    );
  });

  const ensureCurrentUserRoute = createRoute({
    method: "post",
    path: "/api/users/setup/ensure-current-user",
    tags: ["users"],
    summary: "Ensure current authenticated user is onboarded in core.users",
    responses: {
      200: {
        description: "Ensured user",
        content: {
          "application/json": {
            schema: apiSuccessSchema(
              z.object({
                created: z.boolean(),
                user: CoreUserSchema,
              })
            ),
          },
        },
      },
      401: {
        description: "Unauthorized",
        content: { "application/json": { schema: ErrorSchema } },
      },
      500: {
        description: "Configuration error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  });
  (params.app as any).openapi(ensureCurrentUserRoute, async (c: any) => {
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
    return jsonApiSuccessCreateInitialAdmin(
      c,
      params.config,
      async () => {
        const ensured = await dal.ensureCurrentAuthUser(token);
        return {
          created: ensured.created,
          user: ensured.user,
        };
      },
      "A user with this email already exists in the tenant under a different identity id (stale auth mapping — e.g. the local auth database was recreated). Re-link or remove the stale core.users row."
    );
  });

  const workspaceContextRoute = createRoute({
    method: "get",
    path: "/api/users/setup/context",
    tags: ["users"],
    summary: "Get current user workspace context",
    responses: {
      200: {
        description: "Workspace context",
        content: {
          "application/json": {
            schema: apiSuccessSchema(WorkspaceContextSchema),
          },
        },
      },
      401: {
        description: "Unauthorized",
        content: { "application/json": { schema: ErrorSchema } },
      },
      500: {
        description: "Configuration error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  });
  (params.app as any).openapi(workspaceContextRoute, async (c: any) => {
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
    // Service principals first (PLAN-service-identity.md, CP3). They hold no
    // row in auth.users, so the user path below would reject the token at
    // resolveAuthUser before any of this could answer. This check is cheap and
    // local — verifyAccessToken is signature-only, no round trip — and it can
    // only match a token core itself signed.
    const principal = await verifyAccessToken(
      c.req.header("authorization"),
      getSecuritySecret(params.config),
      { transport: "rest" }
    );
    if (principal?.principalType === "service") {
      return jsonApiSuccessOrDatabaseDown(c, params.config, () =>
        dal.getServiceWorkspaceContext({
          capabilities: principal.capabilities,
          principalId: principal.principalId,
          tenantId: principal.tenantId,
        })
      );
    }
    return jsonApiSuccessOrDatabaseDown(c, params.config, () =>
      dal.getWorkspaceContext(token)
    );
  });
}
