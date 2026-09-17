import {
  type AuthInfo,
  type AuthMetadataOptions,
  createMcpHandler,
  McpServer,
  type OAuthTokenVerifier,
  oauthMetadataResponse,
  requireBearerAuth,
  type ServerCapabilities,
} from "@modelcontextprotocol/server";
import { MCP_APPS_EXTENSION, MCP_TASKS_EXTENSION } from "./constants.js";
import { mcpOriginRejected } from "./origin.js";

export interface EngentyMcpHandlerOptions {
  allowedOriginHostnames: string[];
  authenticate: (request: Request) => Promise<AuthInfo | Response>;
  authMetadata: AuthMetadataOptions;
  register: (
    server: McpServer,
    auth: AuthInfo,
    request: Request
  ) => void | Promise<void>;
  serverName?: string;
  serverVersion?: string;
}

const MCP_SERVER_CAPABILITIES = {
  experimental: {
    [MCP_APPS_EXTENSION]: {},
    [MCP_TASKS_EXTENSION]: {},
  },
  resources: {},
  tools: { listChanged: true },
} as ServerCapabilities;

/**
 * Framework-neutral Streamable HTTP handler around the official MCP SDK v2.
 * Each request is stateless: origin check, optional well-known metadata,
 * bearer auth, then a fresh server factory that registers the caller’s tools.
 */
export function createEngentyMcpHttpHandler(
  options: EngentyMcpHandlerOptions
): (request: Request) => Promise<Response> {
  const handler = createMcpHandler(
    async (ctx) => {
      const auth = ctx.authInfo;
      if (!auth) {
        throw new Error("MCP handler invoked without authInfo");
      }
      const server = new McpServer(
        {
          name: options.serverName ?? "engenty",
          version: options.serverVersion ?? "1.0.0",
        },
        {
          cacheHints: {
            "resources/list": { cacheScope: "private", ttlMs: 60_000 },
            "resources/read": { cacheScope: "public", ttlMs: 300_000 },
            "server/discover": { cacheScope: "public", ttlMs: 60_000 },
            "tools/list": { cacheScope: "private", ttlMs: 15_000 },
          },
          capabilities: MCP_SERVER_CAPABILITIES,
          instructions:
            "Engenty MCP. Catalog tools discover reachable operations; direct tools exist only for modules granted to this OAuth client.",
        }
      );
      await options.register(
        server,
        auth,
        ctx.requestInfo ?? new Request(options.authMetadata.resourceServerUrl)
      );
      return server;
    },
    // Cursor and other stable clients still negotiate the 2025-11-25 era.
    // The SDK's stateless compatibility path projects the same registered
    // tools and adapts input_required approval rounds for that wire version.
    { legacy: "stateless" }
  );

  return async (request: Request): Promise<Response> => {
    const originRejected = mcpOriginRejected(
      request,
      options.allowedOriginHostnames
    );
    if (originRejected) {
      return originRejected;
    }
    const metadata = oauthMetadataResponse(request, options.authMetadata);
    if (metadata) {
      return metadata;
    }
    const auth = await options.authenticate(request);
    if (auth instanceof Response) {
      return auth;
    }
    return handler.fetch(request, { authInfo: auth });
  };
}

export function createMcpBearerGate(params: {
  requiredScopes?: string[];
  resourceMetadataUrl: string;
  verifier: OAuthTokenVerifier;
}): (request: Request) => Promise<AuthInfo | Response> {
  return requireBearerAuth({
    requiredScopes: params.requiredScopes,
    resourceMetadataUrl: params.resourceMetadataUrl,
    verifier: params.verifier,
  });
}
