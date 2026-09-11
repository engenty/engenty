import {
  discoverOAuthFacts,
  type RegistryAuthMechanics,
  type RegistryDiscoverPayload,
  type RegistrySurface,
} from "../registry-client.js";
import type { StoredAuthConfig } from "../types.js";

/**
 * Derive the connector auth config. Precedence: the spec's own
 * `securitySchemes` (ground truth) over the registry surface's `auth` block,
 * over the domain's discovered OAuth facts.
 *
 * Nothing is guessed. A surface whose auth we cannot express as one of the
 * three stored shapes — `none`, an authorization-code OAuth app, or a single
 * header/query API key — returns a reject reason naming what was found. In
 * particular an MCP server with unknown or incomplete auth is no longer
 * treated as an open server: importing it as anonymous produced connectors
 * that failed on their first call with an opaque 401.
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

/** Fallback: map the domain's discovered OAuth facts. */
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

/** A credential id reduced to a stored field key. */
function fieldKey(credentialId: string): string {
  const key = credentialId
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .slice(0, 40);
  return key || "api_key";
}

/** Whether a mechanic describes an OAuth flow rather than a static credential. */
function isOauthMechanics(mechanics: RegistryAuthMechanics): boolean {
  if (mechanics.source === "well-known") {
    return true;
  }
  return (
    mechanics.source === "spec" &&
    (mechanics.scheme ?? "").toLowerCase().includes("oauth")
  );
}

/**
 * Map one registry auth alternative. Returns null when this alternative is not
 * expressible — the caller tries the next one before giving up.
 */
function mapSurfaceAuthEntry(params: {
  credentialLabel: (id: string) => string;
  discover: RegistryDiscoverPayload | null;
  entry: { use: Array<{ id: string; mechanics: RegistryAuthMechanics }> };
}): StoredAuthConfig | null {
  const { entry } = params;
  if (entry.use.length === 0) {
    return null;
  }

  if (entry.use.length === 1 && isOauthMechanics(entry.use[0]!.mechanics)) {
    return params.discover ? mapAuthFromRegistry(params.discover) : null;
  }

  // A single header/query credential is the only static placement the stored
  // config can express; multi-credential alternatives (client id + secret
  // headers) have no single placement and fall through to the next entry.
  if (entry.use.length !== 1) {
    return null;
  }
  const { id, mechanics } = entry.use[0]!;
  if (mechanics.source !== "http") {
    return null;
  }
  const placementIn = mechanics.in === "query" ? "query" : "header";
  const name =
    mechanics.headerName ?? (placementIn === "query" ? "api_key" : "X-API-Key");
  if (placementIn === "header" && !mechanics.headerName) {
    return null;
  }
  const key = fieldKey(id);
  const scheme = mechanics.scheme?.trim();
  return {
    fields: [
      {
        key,
        label: params.credentialLabel(id),
        required: true,
        secret: true,
      },
    ],
    kind: "api_key",
    placement: {
      in: placementIn,
      name,
      value_template: scheme ? `${scheme} {{${key}}}` : `{{${key}}}`,
    },
  };
}

/** Human-readable summary of what the registry said, for reject reasons. */
function describeSurfaceAuth(surface: RegistrySurface): string {
  if (surface.auth.entries.length === 0) {
    return `auth status "${surface.auth.status}" with no credential facts`;
  }
  const shapes = surface.auth.entries.map((entry) =>
    entry.use.map((use) => `${use.id} via ${use.mechanics.source}`).join(" + ")
  );
  return `alternatives: ${shapes.join("; ")}`;
}

export function mapAuth(params: {
  discover?: RegistryDiscoverPayload | null;
  securitySchemes?: Record<string, OpenApiSecurityScheme> | null;
  sourceKind: "openapi" | "mcp";
  /** Registry surface the source came from; null for a manual URL. */
  surface?: RegistrySurface | null;
}): MappedAuth {
  const surface = params.surface ?? null;
  if (surface?.auth.status === "none") {
    return { auth: { kind: "none" }, ok: true };
  }

  if (params.securitySchemes) {
    const fromSpec = mapAuthFromSecuritySchemes(params.securitySchemes);
    if (fromSpec) {
      return { auth: fromSpec, ok: true };
    }
  }

  if (surface) {
    const credentials = params.discover?.credentials ?? {};
    const credentialLabel = (id: string) =>
      credentials[id]?.label ?? "API credential";
    for (const entry of surface.auth.entries) {
      const mapped = mapSurfaceAuthEntry({
        credentialLabel,
        discover: params.discover ?? null,
        entry,
      });
      if (mapped) {
        return { auth: mapped, ok: true };
      }
    }
  }

  if (params.discover) {
    const fromRegistry = mapAuthFromRegistry(params.discover);
    if (fromRegistry) {
      return { auth: fromRegistry, ok: true };
    }
  }

  const found = surface
    ? describeSurfaceAuth(surface)
    : params.sourceKind === "openapi"
      ? "no usable securitySchemes in the spec"
      : "no registry auth facts for this endpoint";
  return {
    ok: false,
    reason: `cannot map authentication (${found}) — supported: no auth, OAuth 2 authorization_code, or a single header/query API key`,
  };
}
