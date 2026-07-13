import {
  discoverOAuthFacts,
  type RegistryDiscoverPayload,
} from "../registry-client.js";
import type { StoredAuthConfig } from "../types.js";

/**
 * Derive the connector auth config. Precedence: the spec's own
 * `securitySchemes` (ground truth) over the registry's discovered facts
 * (tagged `detected`/`discovered` upstream — advisory). Returns a reject
 * reason instead of guessing when nothing supportable is found.
 */

export type MappedAuth =
  | { auth: StoredAuthConfig; ok: true }
  | { ok: false; reason: string };

interface OpenApiSecurityScheme {
  bearerFormat?: string;
  flows?: {
    authorizationCode?: {
      authorizationUrl?: string;
      scopes?: Record<string, string>;
      tokenUrl?: string;
    };
  };
  in?: string;
  name?: string;
  scheme?: string;
  type?: string;
}

/** Map an OpenAPI 3.x securitySchemes object (spec wins over registry facts). */
export function mapAuthFromSecuritySchemes(
  schemes: Record<string, OpenApiSecurityScheme>
): StoredAuthConfig | null {
  const entries = Object.entries(schemes);

  const oauth = entries.find(
    ([, s]) => s.type === "oauth2" && s.flows?.authorizationCode
  );
  if (oauth) {
    const flow = oauth[1].flows?.authorizationCode;
    if (flow?.authorizationUrl && flow.tokenUrl) {
      return {
        auth_url: flow.authorizationUrl,
        kind: "oauth2",
        scopes: Object.keys(flow.scopes ?? {}),
        token_url: flow.tokenUrl,
      };
    }
  }

  const bearer = entries.find(
    ([, s]) => s.type === "http" && s.scheme?.toLowerCase() === "bearer"
  );
  if (bearer) {
    return {
      fields: [
        { key: "api_token", label: "API token", required: true, secret: true },
      ],
      kind: "api_key",
      placement: {
        in: "header",
        name: "Authorization",
        value_template: "Bearer {{api_token}}",
      },
    };
  }

  const apiKey = entries.find(
    ([, s]) => s.type === "apiKey" && (s.in === "header" || s.in === "query")
  );
  if (apiKey) {
    const scheme = apiKey[1];
    return {
      fields: [
        { key: "api_key", label: "API key", required: true, secret: true },
      ],
      kind: "api_key",
      placement: {
        in: scheme.in === "query" ? "query" : "header",
        name: scheme.name ?? "X-API-Key",
        value_template: "{{api_key}}",
      },
    };
  }

  return null;
}

/** Fallback: map the registry's discovered OAuth facts. */
export function mapAuthFromRegistry(
  discover: RegistryDiscoverPayload
): StoredAuthConfig | null {
  const oauth = discoverOAuthFacts(discover);
  if (
    oauth?.authorizationEndpoint &&
    oauth.tokenEndpoint &&
    (oauth.grantTypes.length === 0 ||
      oauth.grantTypes.includes("authorization_code"))
  ) {
    return {
      auth_url: oauth.authorizationEndpoint,
      kind: "oauth2",
      scopes: oauth.scopes,
      token_url: oauth.tokenEndpoint,
    };
  }
  return null;
}

export function mapAuth(params: {
  discover?: RegistryDiscoverPayload | null;
  securitySchemes?: Record<string, OpenApiSecurityScheme> | null;
  /** MCP endpoints commonly take a bearer; allow "none" for open servers. */
  sourceKind: "openapi" | "mcp";
}): MappedAuth {
  if (params.securitySchemes) {
    const fromSpec = mapAuthFromSecuritySchemes(params.securitySchemes);
    if (fromSpec) {
      return { auth: fromSpec, ok: true };
    }
  }
  if (params.discover) {
    const fromRegistry = mapAuthFromRegistry(params.discover);
    if (fromRegistry) {
      return { auth: fromRegistry, ok: true };
    }
  }
  if (params.sourceKind === "mcp") {
    // Open MCP servers exist; bearer-token servers get api_key via override.
    return { auth: { kind: "none" }, ok: true };
  }
  return {
    ok: false,
    reason:
      "no supported auth found (need oauth2 authorization_code, http bearer, or apiKey header/query)",
  };
}
