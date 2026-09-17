import {
  CATALOG_TOOL_IDS,
  fromJsonSchema,
  getMcpAppTemplate,
  listMcpAppTemplates,
  type McpServer,
  OPERATION_RESULT_WIDGET_URI,
  registerAppResource,
  registerAppTool,
  type ServerContext,
} from "@engenty/mcp-server";
import { z } from "zod";
import type { PrincipalContext } from "../../security/auth.js";
import { buildOperationContracts } from "../operation-contracts.js";
import type { McpClientGrant } from "./grants.js";
import type { McpInvokeRuntime } from "./invoke-mcp.js";
import { invokeMcpOperation, textResult } from "./invoke-mcp.js";
import {
  catalogExecuteAllowed,
  catalogToolNames,
  modulesFromContracts,
  projectDirectTools,
  searchContracts,
} from "./tools.js";

const executeInput = z.object({
  arguments: z.record(z.string(), z.unknown()).optional(),
  engentySpaceId: z.string().optional(),
  operationId: z.string().min(1),
  requestState: z.string().optional(),
});

const SPACES_TOOL_ID = "engenty_spaces_list";

function withSpaceSelection(
  schema: Record<string, unknown>,
  required: boolean
): Record<string, unknown> {
  const properties =
    schema.properties && typeof schema.properties === "object"
      ? (schema.properties as Record<string, unknown>)
      : {};
  const currentRequired = Array.isArray(schema.required)
    ? schema.required.filter((item): item is string => typeof item === "string")
    : [];
  return {
    ...schema,
    properties: {
      ...properties,
      engentySpaceId: {
        description: "Space id for this call.",
        type: "string",
      },
    },
    ...(required
      ? { required: [...new Set([...currentRequired, "engentySpaceId"])] }
      : {}),
  };
}

function splitSpaceSelection(input: unknown): {
  operationInput: unknown;
  spaceId?: string;
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { operationInput: input };
  }
  const { engentySpaceId, ...operationInput } = input as Record<
    string,
    unknown
  >;
  return {
    operationInput,
    ...(typeof engentySpaceId === "string" && engentySpaceId.trim()
      ? { spaceId: engentySpaceId.trim() }
      : {}),
  };
}

export async function registerMcpSurface(params: {
  grant: McpClientGrant;
  principal: PrincipalContext;
  runtime: McpInvokeRuntime;
  server: McpServer;
}): Promise<void> {
  const { grant, principal, runtime, server } = params;
  const contracts = buildOperationContracts(runtime.registry);
  const spaces = await runtime.authority.listSpaces(grant, principal);
  const authorizedPrincipals = await Promise.all(
    spaces.map((space) => runtime.authority.resolve(grant, principal, space.id))
  );
  const projectedModuleIds = [
    ...new Set(authorizedPrincipals.flatMap((item) => item.moduleIds)),
  ];
  const projectionPrincipal: PrincipalContext = {
    ...principal,
    capabilities: [
      ...new Set(authorizedPrincipals.flatMap((item) => item.capabilities)),
    ],
    maxRiskLevel: grant.maxRiskLevel,
    moduleIds:
      projectedModuleIds.length > 0
        ? projectedModuleIds
        : ["__no_accessible_space__"],
  };
  const spaceRequired = grant.spaceIds.length > 1;

  const invoke = (
    operationId: string,
    input: unknown,
    ctx?: ServerContext,
    requestState?: string
  ) => {
    const contract = contracts.find((item) => item.operationId === operationId);
    if (!contract) {
      throw new Error(`Unknown operation: ${operationId}`);
    }
    const selected = splitSpaceSelection(input);
    return invokeMcpOperation({
      arguments: selected.operationInput,
      contract,
      ctx,
      grant,
      operationId,
      principal,
      requestState,
      runtime,
      ...(selected.spaceId ? { spaceId: selected.spaceId } : {}),
    });
  };

  server.registerTool(
    SPACES_TOOL_ID,
    {
      description:
        "List the Spaces this MCP client may use. Pass one id as engentySpaceId when more than one is available.",
      inputSchema: z.object({}),
    },
    async () => textResult("Granted Spaces.", spaces)
  );
  server.registerTool(
    CATALOG_TOOL_IDS.modules,
    {
      description:
        "List Engenty modules the caller may reach over MCP, with operation counts.",
      inputSchema: z.object({}),
    },
    async () =>
      textResult(
        "Reachable modules.",
        modulesFromContracts(contracts, projectionPrincipal)
      )
  );
  server.registerTool(
    CATALOG_TOOL_IDS.search,
    {
      description:
        "Search reachable Engenty operations by name, module, or description.",
      inputSchema: z.object({ query: z.string().optional() }),
    },
    async (args) => {
      const query =
        args && typeof args === "object" && "query" in args
          ? String((args as { query?: string }).query ?? "")
          : "";
      const hits = searchContracts(contracts, projectionPrincipal, query).map(
        (item) => ({
          description: item.description ?? item.summary,
          moduleId: item.moduleId,
          operationId: item.operationId,
          readOnly: item.readOnly,
        })
      );
      return textResult(`Found ${hits.length} operations.`, hits);
    }
  );
  server.registerTool(
    CATALOG_TOOL_IDS.describe,
    {
      description:
        "Return the JSON Schema 2020-12 contract for one reachable operation.",
      inputSchema: z.object({ operationId: z.string() }),
    },
    async (args) => {
      const operationId = String(
        (args as { operationId?: string }).operationId ?? ""
      );
      const contract = contracts.find(
        (item) => item.operationId === operationId
      );
      if (!(contract && catalogExecuteAllowed(contract, projectionPrincipal))) {
        throw new Error(`Operation not reachable: ${operationId}`);
      }
      return textResult(`Contract for ${operationId}.`, contract);
    }
  );
  registerAppTool(
    server,
    CATALOG_TOOL_IDS.execute,
    {
      description:
        "Execute a catalog-eligible Engenty operation through the governed invoke path.",
      inputSchema: spaceRequired
        ? executeInput.extend({ engentySpaceId: z.string().min(1) })
        : executeInput,
      _meta: { ui: { resourceUri: OPERATION_RESULT_WIDGET_URI } },
    },
    async (args: unknown, ctx: ServerContext) => {
      const parsed = executeInput.parse(args);
      const contract = contracts.find(
        (item) => item.operationId === parsed.operationId
      );
      if (!(contract && catalogExecuteAllowed(contract, projectionPrincipal))) {
        throw new Error(
          `Operation not catalog-executable: ${parsed.operationId}`
        );
      }
      return invoke(
        parsed.operationId,
        {
          ...(parsed.arguments ?? {}),
          ...(parsed.engentySpaceId
            ? { engentySpaceId: parsed.engentySpaceId }
            : {}),
        },
        ctx,
        parsed.requestState
      );
    }
  );

  for (const tool of projectDirectTools(contracts, projectionPrincipal)) {
    if (catalogToolNames().includes(tool.name)) {
      continue;
    }
    const config = {
      annotations: tool.annotations,
      description: tool.description,
      inputSchema: fromJsonSchema(
        withSpaceSelection(tool.inputSchema, spaceRequired)
      ),
    };
    const callback = async (args: unknown, ctx: ServerContext) =>
      invoke(tool.name, args ?? {}, ctx);
    if (tool.resourceUri) {
      registerAppTool(
        server,
        tool.name,
        {
          ...config,
          _meta: { ui: { resourceUri: tool.resourceUri } },
        },
        callback
      );
    } else {
      server.registerTool(tool.name, config, callback);
    }
  }

  for (const template of listMcpAppTemplates()) {
    registerAppResource(
      server,
      template.uri,
      template.uri,
      {
        description: `MCP App template ${template.uri}`,
        _meta: {
          ui: {
            csp: {
              connectDomains: template.csp?.connectDomains ?? [],
              resourceDomains: template.csp?.resourceDomains ?? [],
            },
          },
        },
      },
      async () => ({
        contents: [
          {
            uri: template.uri,
            mimeType: "text/html;profile=mcp-app",
            text: getMcpAppTemplate(template.uri)?.html ?? template.html,
          },
        ],
      })
    );
  }
}
