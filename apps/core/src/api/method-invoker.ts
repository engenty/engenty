import type { ApiErrorShape } from "@engenty/api-contracts";
import { formatZodErrorForApiError, isZodError } from "@engenty/api-contracts";
import type { PluginRegistry } from "../plugins/registry.js";

/**
 * Thrown when registered method input or output validation fails (Zod).
 * Callers may map to HTTP 400 using `body`.
 */
export class MethodValidationError extends Error {
  readonly body: ApiErrorShape;

  constructor(body: ApiErrorShape) {
    super(body.message);
    this.body = body;
    this.name = "MethodValidationError";
  }
}

type RegisteredMethodEntry = PluginRegistry["gatewayMethods"][number];

function buildMethodMap(
  registry: PluginRegistry
): Map<string, RegisteredMethodEntry> {
  return new Map(
    registry.gatewayMethods.map((entry) => [entry.method.name, entry])
  );
}

export interface MethodInvokerAuth {
  principalId: string;
  scopeId?: string;
  tenantId: string | null;
}

/** Dispatches in-process calls to `registry.gatewayMethods` (plugin-sdk). */
export function createMethodInvoker(params: {
  registry: PluginRegistry;
  config: Record<string, unknown>;
  dataDir: string;
  resolvePath: (p: string) => string;
}) {
  const map = buildMethodMap(params.registry);
  return async (
    methodName: string,
    input: unknown,
    opts: { auth?: MethodInvokerAuth } = {}
  ): Promise<unknown> => {
    const entry = map.get(methodName);
    if (!entry) {
      throw new Error(`Unknown registered method: ${methodName}`);
    }
    const auth = opts.auth;
    let parsed: unknown;
    try {
      parsed = entry.method.inputSchema
        ? entry.method.inputSchema.parse(input)
        : input;
    } catch (e) {
      if (isZodError(e)) {
        throw new MethodValidationError(formatZodErrorForApiError(e));
      }
      throw e;
    }
    const result = await entry.method.handler(parsed, {
      config: params.config,
      pluginConfig: entry.pluginConfig,
      dataDir: params.dataDir,
      resolvePath: params.resolvePath,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      auth: auth
        ? {
            principalId: auth.principalId,
            tenantId: auth.tenantId ?? "default",
            scopeId: auth.scopeId ?? "default",
          }
        : undefined,
    });
    try {
      return entry.method.outputSchema
        ? entry.method.outputSchema.parse(result)
        : result;
    } catch (e) {
      if (isZodError(e)) {
        throw new MethodValidationError(formatZodErrorForApiError(e));
      }
      throw e;
    }
  };
}
