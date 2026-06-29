import type {
  EngentyApiCatalogInput,
  EngentyApiCatalogResult,
} from "@engenty/ai-core";
import { resolvePluginCapability } from "../plugins/capability-resolver.js";
import type { PluginRegistry } from "../plugins/registry.js";
import { rankCatalogEntries } from "./api-catalog-search.js";
import { buildOperationContracts } from "./operation-contracts.js";
import {
  getHttpRouteCapability,
  getRegisteredHttpRouteCapabilities,
} from "./plugin-route-capabilities.js";

type HttpMethod =
  | "get"
  | "post"
  | "put"
  | "patch"
  | "delete"
  | "options"
  | "head";

interface OpenApiSchema {
  $ref?: string;
  anyOf?: OpenApiSchema[];
  enum?: unknown[];
  items?: OpenApiSchema;
  oneOf?: OpenApiSchema[];
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
  type?: string | string[];
  [key: string]: unknown;
}

interface OpenApiOperation {
  description?: string;
  parameters?: Array<{ in?: string; name?: string }>;
  requestBody?: {
    content?: Record<string, { schema?: OpenApiSchema }>;
  };
  responses?: Record<
    string,
    {
      content?: Record<string, { schema?: OpenApiSchema }>;
    }
  >;
  summary?: string;
  tags?: string[];
}

interface OpenApiDocument {
  components?: { schemas?: Record<string, OpenApiSchema> };
  paths?: Record<string, Partial<Record<HttpMethod, OpenApiOperation>>>;
}

const HTTP_METHODS: HttpMethod[] = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
];

function resolveSchema(
  document: OpenApiDocument,
  schema?: OpenApiSchema
): OpenApiSchema | undefined {
  if (!schema?.$ref) {
    return schema;
  }
  const ref = schema.$ref;
  const prefix = "#/components/schemas/";
  if (!ref.startsWith(prefix)) {
    return schema;
  }
  const key = ref.slice(prefix.length);
  return document.components?.schemas?.[key] ?? schema;
}

function summarizeSchema(
  document: OpenApiDocument,
  schema?: OpenApiSchema,
  depth = 0
): string | undefined {
  const resolved = resolveSchema(document, schema);
  if (!resolved) {
    return;
  }
  const resolvedType = Array.isArray(resolved.type)
    ? resolved.type[0]
    : resolved.type;
  if (depth > 1) {
    return resolvedType ?? "value";
  }
  if (Array.isArray(resolved.enum) && resolved.enum.length > 0) {
    return `enum(${resolved.enum.slice(0, 4).join(", ")})`;
  }
  if (Array.isArray(resolved.oneOf) && resolved.oneOf.length > 0) {
    return resolved.oneOf
      .slice(0, 3)
      .map((part) => summarizeSchema(document, part, depth + 1) ?? "value")
      .join(" | ");
  }
  if (Array.isArray(resolved.anyOf) && resolved.anyOf.length > 0) {
    return resolved.anyOf
      .slice(0, 3)
      .map((part) => summarizeSchema(document, part, depth + 1) ?? "value")
      .join(" | ");
  }
  if (resolvedType === "array") {
    return `Array<${summarizeSchema(document, resolved.items, depth + 1) ?? "value"}>`;
  }
  if (resolvedType === "object" || resolved.properties) {
    const properties = Object.entries(resolved.properties ?? {}).slice(0, 6);
    if (properties.length === 0) {
      return "object";
    }
    const required = new Set(resolved.required ?? []);
    const fields = properties.map(
      ([name, value]) =>
        `${name}${required.has(name) ? "" : "?"}: ${summarizeSchema(document, value, depth + 1) ?? "value"}`
    );
    return `{ ${fields.join(", ")} }`;
  }
  return resolvedType ?? "value";
}

function buildRouteMetaMap(registry: PluginRegistry) {
  const map = new Map<
    string,
    {
      auth: {
        requiredCapabilities: string[];
        requiresApproval: boolean;
        riskLevel: "low" | "medium" | "high" | "critical";
      };
      capability: string;
      moduleId?: string;
      pluginId: string;
    }
  >();
  for (const entry of registry.httpRoutes) {
    const operation = entry.route.operation;
    map.set(`${entry.route.method}:${entry.route.path}`, {
      auth: {
        requiredCapabilities: operation?.requiredCapabilities ?? [],
        requiresApproval: operation?.requiresApproval ?? false,
        riskLevel: operation?.riskLevel ?? "low",
      },
      capability: getHttpRouteCapability(entry.pluginId, entry.route),
      moduleId: operation?.moduleId ?? entry.pluginId,
      pluginId: entry.pluginId,
    });
  }
  return map;
}

function resolveCatalogCapability(params: {
  capability: string;
  contributionKind: "http_route" | "operation";
  pluginId: string;
  registry: PluginRegistry;
  registeredCapabilities: string[];
  tenantId?: string | null;
  tenantPluginOverrides?: Record<string, boolean>;
}) {
  if (!params.tenantId || params.pluginId === "core") {
    return true;
  }
  return resolvePluginCapability({
    capability: params.capability,
    contributionKind: params.contributionKind,
    pluginId: params.pluginId,
    registeredCapabilities: params.registeredCapabilities,
    registry: params.registry,
    tenantId: params.tenantId,
    tenantPluginOverrides: params.tenantPluginOverrides,
  }).allowed;
}

export async function buildApiCatalog(params: {
  input: EngentyApiCatalogInput;
  openApiDocument: OpenApiDocument;
  registry: PluginRegistry;
  tenantId?: string | null;
  tenantPluginOverrides?: Record<string, boolean>;
}): Promise<EngentyApiCatalogResult> {
  const routeMetaMap = buildRouteMetaMap(params.registry);
  const httpEntries = Object.entries(
    params.openApiDocument.paths ?? {}
  ).flatMap(([path, methods]) =>
    HTTP_METHODS.flatMap((method) => {
      const operation = methods?.[method];
      if (!operation) {
        return [];
      }
      const requestBodySchema =
        operation.requestBody?.content?.["application/json"]?.schema;
      const successStatuses = Object.keys(operation.responses ?? {})
        .filter((status) => /^[2-9]\d\d$/.test(status))
        .map((status) => Number.parseInt(status, 10));
      const responseSchema = Object.values(operation.responses ?? {}).find(
        (response) => response.content?.["application/json"]?.schema
      )?.content?.["application/json"]?.schema;
      const routeMeta = routeMetaMap.get(`${method}:${path}`);
      if (
        routeMeta &&
        !resolveCatalogCapability({
          capability: routeMeta.capability,
          contributionKind: "http_route",
          pluginId: routeMeta.pluginId,
          registeredCapabilities: getRegisteredHttpRouteCapabilities(
            params.registry,
            routeMeta.pluginId
          ),
          registry: params.registry,
          tenantId: params.tenantId,
          tenantPluginOverrides: params.tenantPluginOverrides,
        })
      ) {
        return [];
      }
      return [
        {
          ...(routeMeta ? { auth: routeMeta.auth } : {}),
          description: operation.description,
          id: `${method.toUpperCase()} ${path}`,
          kind: "http_route" as const,
          method,
          ...(routeMeta?.moduleId ? { moduleId: routeMeta.moduleId } : {}),
          path,
          ...(routeMeta?.pluginId ? { pluginId: routeMeta.pluginId } : {}),
          readOnly:
            method === "get" || method === "head" || method === "options",
          request: {
            ...(requestBodySchema
              ? {
                  body:
                    summarizeSchema(
                      params.openApiDocument,
                      requestBodySchema
                    ) ?? "body",
                }
              : {}),
            params: (operation.parameters ?? [])
              .filter((parameter) => parameter.in === "path" && parameter.name)
              .map((parameter) => parameter.name as string),
            query: (operation.parameters ?? [])
              .filter((parameter) => parameter.in === "query" && parameter.name)
              .map((parameter) => parameter.name as string),
          },
          response: {
            ...(responseSchema
              ? {
                  schema:
                    summarizeSchema(params.openApiDocument, responseSchema) ??
                    "response",
                }
              : {}),
            successStatuses,
          },
          tags: operation.tags,
          title: operation.summary ?? path,
        },
      ];
    })
  );

  const operationEntries = buildOperationContracts(params.registry)
    .filter((contract) =>
      resolveCatalogCapability({
        capability: contract.operationId,
        contributionKind: "operation",
        pluginId: contract.pluginId,
        registeredCapabilities: params.registry.moduleOperations
          .filter((item) => item.pluginId === contract.pluginId)
          .map((item) => item.operationId),
        registry: params.registry,
        tenantId: params.tenantId,
        tenantPluginOverrides: params.tenantPluginOverrides,
      })
    )
    .map((contract) => ({
      auth: contract.auth,
      description: contract.description,
      id: contract.toolId,
      inputSchema: contract.inputSchema.hint,
      kind: "tool" as const,
      moduleId: contract.moduleId,
      outputSchema: contract.outputSchema.hint,
      pluginId: contract.pluginId,
      readOnly: contract.readOnly,
      title: contract.summary ?? contract.toolId,
      toolId: contract.toolId,
      transports: contract.transports,
    }));

  const filtered = [...httpEntries, ...operationEntries].filter((entry) => {
    if (
      params.input.kind &&
      params.input.kind !== "all" &&
      entry.kind !== params.input.kind
    ) {
      return false;
    }
    if (
      entry.kind === "http_route" &&
      params.input.method &&
      entry.method !== params.input.method
    ) {
      return false;
    }
    if (params.input.readOnlyOnly && !entry.readOnly) {
      return false;
    }
    if (params.input.moduleId && entry.moduleId !== params.input.moduleId) {
      return false;
    }
    if (params.input.pluginId && entry.pluginId !== params.input.pluginId) {
      return false;
    }
    return true;
  });

  const sorted = params.input.query?.trim()
    ? await rankCatalogEntries(filtered, {
        query: params.input.query,
        strategy: params.input.strategy,
      })
    : filtered.sort((a, b) => {
        if (a.kind !== b.kind) {
          return a.kind === "tool" ? -1 : 1;
        }
        if (a.readOnly !== b.readOnly) {
          return a.readOnly ? -1 : 1;
        }
        return a.title.localeCompare(b.title);
      });

  const matches = sorted.slice(0, params.input.limit);

  if (!params.input.query?.trim()) {
    return {
      matches,
      total: filtered.length,
    };
  }

  return {
    matches,
    total: sorted.length,
  };
}
