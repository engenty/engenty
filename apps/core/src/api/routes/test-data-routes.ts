import type { OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";
import type { PluginRegistry } from "../../plugins/registry.js";
import type { createApprovalService } from "../../security/approval-service.js";
import type { SecurityAuditLogAdapter } from "../../security/audit-adapter.js";
import {
  generateTestData,
  TestDataLlmHttpError,
} from "../../services/test-data-generator.js";
import {
  jsonApiError,
  jsonApiPassthrough,
  jsonApiSuccess,
} from "./api-response.js";
import { requireSuperAdmin, toPrincipalContext } from "./authz.js";
import {
  InvokeOperationError,
  invokeOperation,
} from "./plugins/module-operation-routes.js";
import type { ApiLogger } from "./types.js";

type ApprovalService = ReturnType<typeof createApprovalService>;

const COUNT_MIN = 1;
const COUNT_MAX = 200;
const INSTRUCTIONS_MAX = 2000;

const generatePreviewRequestSchema = z.object({
  module_id: z.string().min(1),
  data_type: z.string().min(1),
  count: z.coerce.number().int().min(COUNT_MIN).max(COUNT_MAX).default(10),
  instructions: z.string().max(2000).optional().default(""),
  tenant_id: z.string().min(1).optional(),
});

const applyRequestSchema = z.object({
  module_id: z.string().min(1),
  data_type: z.string().min(1),
  tenant_id: z.string().min(1),
  records: z.array(z.record(z.string(), z.unknown())).min(1),
});

function findRegistration(
  registry: PluginRegistry,
  module_id: string,
  data_type: string
) {
  return registry.testDataTypes.find(
    (entry) =>
      entry.registration.meta.module_id === module_id &&
      entry.registration.meta.data_type === data_type
  );
}

export function registerTestDataRoutes(params: {
  app: OpenAPIHono;
  approvalService: ApprovalService;
  auditLog: SecurityAuditLogAdapter;
  config: Record<string, unknown>;
  dataDir: string;
  getLogger: (c: { get: (k: "evlog") => unknown }) => ApiLogger;
  registry: PluginRegistry;
  resolvePath: (p: string) => string;
}) {
  const {
    app,
    approvalService,
    auditLog,
    config,
    registry,
    getLogger,
    dataDir,
    resolvePath,
  } = params;

  app.get("/api/test-data/types", async (c) => {
    const authResult = await requireSuperAdmin(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }

    const types = registry.testDataTypes.map((entry) => ({
      module_id: entry.registration.meta.module_id,
      data_type: entry.registration.meta.data_type,
      description: entry.registration.meta.description ?? null,
      plugin_id: entry.pluginId,
    }));

    return jsonApiSuccess(c, types);
  });

  app.post("/api/test-data/generate-preview", async (c) => {
    const logger = getLogger(c);
    const authResult = await requireSuperAdmin(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }

    const parseResult = generatePreviewRequestSchema.safeParse(
      await c.req.json().catch(() => ({}))
    );
    if (!parseResult.success) {
      return jsonApiError(c, 400, {
        message: "Invalid request",
        details: parseResult.error.flatten(),
      });
    }
    const body = parseResult.data;
    const module_id = body.module_id.trim();
    const data_type = body.data_type.trim();
    const tenantId = body.tenant_id?.trim() || (authResult.auth.tenantId ?? "");
    if (!tenantId) {
      return jsonApiError(c, 400, {
        message: "Tenant context required for test data generation",
      });
    }

    const entry = findRegistration(registry, module_id, data_type);
    if (!entry) {
      return jsonApiError(c, 404, {
        message: `Unknown test data type: ${module_id}:${data_type}`,
      });
    }

    try {
      const { records, warnings } = await generateTestData({
        config,
        count: body.count,
        data_type,
        instructions: body.instructions || undefined,
        logger,
        module_id,
        recordSchema: entry.registration.meta.recordSchema,
        schemaDescription: entry.registration.meta.schemaDescription,
      });
      return jsonApiSuccess(c, {
        records,
        warnings,
      });
    } catch (err) {
      if (err instanceof TestDataLlmHttpError) {
        const message = err.message;
        if (err.httpStatus === 429) {
          logger.warn(`Test data preview rate limited: ${message}`);
          return jsonApiError(c, 429, {
            code: "rate_limited",
            message:
              "The AI provider is rate-limiting requests. Wait a short time and try again, or generate previews less often.",
            details: message,
          });
        }
        if (err.httpStatus === 502 || err.httpStatus === 503) {
          logger.warn(`Test data preview LLM unavailable: ${message}`);
          return jsonApiError(c, 503, {
            code: "service_unavailable",
            message:
              "The AI provider is temporarily unavailable. Try again in a moment.",
            details: message,
          });
        }
      }
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Test data preview generation failed: ${message}`);
      return jsonApiError(c, 500, {
        message: "Generation failed",
        details: message,
      });
    }
  });

  app.post("/api/test-data/apply", async (c) => {
    const logger = getLogger(c);
    const authResult = await requireSuperAdmin(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }

    const parseResult = applyRequestSchema.safeParse(
      await c.req.json().catch(() => ({}))
    );
    if (!parseResult.success) {
      return jsonApiError(c, 400, {
        message: "Invalid request",
        details: parseResult.error.flatten(),
      });
    }
    const body = parseResult.data;
    const entry = findRegistration(
      registry,
      body.module_id.trim(),
      body.data_type.trim()
    );
    if (!entry) {
      return jsonApiError(c, 404, {
        message: `Unknown test data type: ${body.module_id}:${body.data_type}`,
      });
    }

    const createOperationId = entry.registration.meta.createOperationId;
    if (createOperationId) {
      const principalContext = {
        ...toPrincipalContext(authResult.auth),
        tenantId: body.tenant_id,
      };
      let created_count = 0;
      for (const record of body.records) {
        const input = entry.registration.normalizeInput?.(
          { ...record },
          { principalId: principalContext.principalId }
        ) ?? { ...record };
        try {
          await invokeOperation({
            auth: principalContext,
            registry,
            config,
            dataDir,
            resolvePath,
            operationId: createOperationId,
            input,
            approvalService,
            auditLog,
          });
          created_count++;
        } catch (err) {
          if (err instanceof InvokeOperationError) {
            if (err.body instanceof Object && "ok" in err.body) {
              return jsonApiPassthrough(c, err.body, err.status);
            }
            const body = err.body as Record<string, unknown> | undefined;
            if (
              body &&
              typeof body.code === "string" &&
              typeof body.message === "string"
            ) {
              return jsonApiError(c, err.status, {
                code: body.code,
                message: body.message,
                ...(body.details !== undefined && { details: body.details }),
                ...(body.fields !== undefined && {
                  fields: body.fields as Record<string, string[]>,
                }),
              });
            }
            return jsonApiError(c, err.status, {
              message: err.message,
              details: err.body,
            });
          }
          const message = err instanceof Error ? err.message : String(err);
          logger.error(`Test data apply failed: ${message}`);
          return jsonApiError(c, 500, {
            message: "Apply failed",
            details: message,
          });
        }
      }
      return jsonApiSuccess(c, { created_count });
    }

    const ctx = {
      auth:
        authResult.auth.userId == null
          ? undefined
          : {
              principalId: authResult.auth.userId,
              tenantId: body.tenant_id,
              scopeId: "default",
            },
      config,
      dataDir,
      logger: {
        info: logger.info,
        warn: logger.warn,
        error: logger.error,
        debug: () => {},
      },
      pluginConfig: entry.pluginConfig,
      resolvePath,
      tenantId: body.tenant_id,
      scopeId: "default",
    };

    try {
      const created_count = await entry.registration.persist(body.records, ctx);
      return jsonApiSuccess(c, { created_count });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Test data apply failed: ${message}`);
      return jsonApiError(c, 500, {
        message: "Apply failed",
        details: message,
      });
    }
  });
}
