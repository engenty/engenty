import { z } from "zod";
import { createGuardedFetch } from "./net/guarded-fetch.js";
import type { ExternalSourceKind, McpTransport } from "./types.js";

/**
 * Client for the integrations.sh registry (payload `version: 3`). Contacted
 * ONLY during admin search/preview/import — never at agent runtime.
 *
 * The registry's own wire schema is the contract: `/api/search` returns
 * domain-level hits each carrying a `surfaces[]` summary, and
 * `GET /api/{domain}/surface` returns the cached catalog document shown on the
 * public page — `surfaces[]` as a discriminated union on `type` (`http`,
 * `mcp`, `graphql`, `cli`) plus a `credentials` registry keyed by id. Parsing
 * stays loose (unknown keys pass through) and the raw payload is persisted on
 * the imported record for forensics, but every field this module *acts* on is
 * validated here.
 *
 * `/surface` is preferred over `/discover` (live re-probe — often hangs past
 * our request timeout while `/surface` returns in hundreds of ms).
 */

const DEFAULT_REGISTRY_URL = "https://integrations.sh";
const REQUEST_TIMEOUT_MS = 20_000;

/** Remote MCP transports this module can actually speak. */
const SUPPORTED_MCP_TRANSPORTS: readonly string[] = ["streamable-http", "sse"];

export function registryBaseUrl(): string {
  return (
    process.env.ENGENTY_INTEGRATIONS_REGISTRY_URL ?? DEFAULT_REGISTRY_URL
  ).replace(/\/+$/u, "");
}

// ---------------------------------------------------------------------------
// Wire schemas
// ---------------------------------------------------------------------------

/** RFC 6902 operation, as the registry publishes spec corrections. */
const jsonPatchOperationSchema = z
  .object({
    from: z.string().optional(),
    op: z.enum(["add", "remove", "replace", "move", "copy", "test"]),
    path: z.string(),
    value: z.unknown().optional(),
  })
  .loose();

export type JsonPatchOperation = z.infer<typeof jsonPatchOperationSchema>;

/**
 * How one credential rides the request. `source` decides what we can map:
 * `http` (header/query placement) and `spec`/`well-known` (auth described by
 * the spec or an OAuth discovery document) are actionable; `cli` and
 * `unknown` are not.
 */
const authMechanicsSchema = z
  .object({
    command: z.string().optional(),
    env: z.array(z.string()).optional(),
    headerName: z.string().optional(),
    in: z.string().optional(),
    scheme: z.string().optional(),
    source: z.string(),
  })
  .loose();

export type RegistryAuthMechanics = z.infer<typeof authMechanicsSchema>;

/** One credential an entry needs; an entry's `use[]` are needed together (AND). */
const authUseSchema = z
  .object({ id: z.string(), mechanics: authMechanicsSchema })
  .loose();

/** `entries[]` are alternatives (OR) — any one of them authenticates. */
const authEntrySchema = z
  .object({ use: z.array(authUseSchema).default([]) })
  .loose();

const surfaceAuthSchema = z
  .object({
    entries: z.array(authEntrySchema).default([]),
    status: z.string().default("unknown"),
  })
  .loose();

export type RegistrySurfaceAuth = z.infer<typeof surfaceAuthSchema>;

const requiredHeaderSchema = z
  .object({
    description: z.string().nullish(),
    name: z.string(),
    source: z
      .object({ kind: z.string(), value: z.string().nullish() })
      .loose()
      .nullish(),
  })
  .loose();

export type RegistryRequiredHeader = z.infer<typeof requiredHeaderSchema>;

const surfaceVariableSchema = z
  .object({
    description: z.string().nullish(),
    in: z.string().nullish(),
    name: z.string(),
    resolveFrom: z.string().nullish(),
  })
  .loose();

export type RegistryVariable = z.infer<typeof surfaceVariableSchema>;

const surfaceSchema = z
  .object({
    auth: surfaceAuthSchema.nullish(),
    docs: z.string().nullish(),
    name: z.string().nullish(),
    requiredHeaders: z.array(requiredHeaderSchema).default([]),
    slug: z.string().nullish(),
    spec: z.string().nullish(),
    specAlternates: z.array(z.string()).default([]),
    specOverrides: z.array(jsonPatchOperationSchema).default([]),
    transports: z.array(z.string()).nullish(),
    type: z.string(),
    url: z.string().nullish(),
    variables: z.array(surfaceVariableSchema).default([]),
  })
  .loose();

const credentialSchema = z
  .object({
    generateUrl: z.string().nullish(),
    label: z.string().nullish(),
    setup: z.string().nullish(),
    type: z.string(),
  })
  .loose();

export type RegistryCredential = z.infer<typeof credentialSchema>;

/**
 * OAuth facts probed from `/.well-known/oauth-authorization-server` &co. The
 * `credentials` registry describes OAuth in prose only, so these endpoints are
 * the sole machine-readable source for an authorization-code mapping.
 */
const oauthFactsSchema = z
  .object({
    authorizationEndpoint: z.string().optional(),
    dcr: z.boolean().optional(),
    grantTypes: z.array(z.string()).default([]),
    registrationEndpoint: z.string().optional(),
    scopes: z.array(z.string()).default([]),
    tokenEndpoint: z.string().optional(),
  })
  .loose();

export type RegistryOAuthFacts = z.infer<typeof oauthFactsSchema>;

const discoverSchema = z
  .object({
    credentials: z.record(z.string(), credentialSchema).default({}),
    description: z.string().nullish(),
    detect: z
      .object({
        auth: z.object({ oauth: oauthFactsSchema.nullish() }).loose().nullish(),
      })
      .loose()
      .nullish(),
    domain: z.string(),
    summary: z.string().nullish(),
    surfaces: z.array(surfaceSchema).default([]),
    version: z.number().optional(),
  })
  .loose();

export type RegistryDiscoverPayload = z.infer<typeof discoverSchema>;

/** Surface summary carried on a search hit (same identity, fewer facts). */
const searchSurfaceSchema = z
  .object({
    auth: z
      .object({
        header: z.string().nullish(),
        kind: z.string().nullish(),
        note: z.string().nullish(),
      })
      .loose()
      .nullish(),
    icon: z.string().nullish(),
    kind: z.string(),
    slug: z.string(),
    specOverrides: z.array(jsonPatchOperationSchema).default([]),
    url: z.string().nullish(),
  })
  .loose();

export type RegistrySearchSurface = z.infer<typeof searchSurfaceSchema>;

const searchResultSchema = z.object({
  description: z.string().default(""),
  domain: z.string(),
  kinds: z.array(z.string()).default([]),
  name: z.string(),
  surfaces: z.array(searchSurfaceSchema).default([]),
  url: z.string().default(""),
});

const searchResponseSchema = z.object({
  results: z.array(searchResultSchema).default([]),
});

export type RegistrySearchResult = z.infer<typeof searchResultSchema>;

/** Parse a `/api/{domain}/surface` body. Exported so fixtures parse identically. */
export function parseSurfacePayload(data: unknown): RegistryDiscoverPayload {
  return discoverSchema.parse(data);
}

/** Parse an `/api/search` body. */
export function parseSearchResponse(data: unknown): RegistrySearchResult[] {
  return searchResponseSchema.parse(data).results;
}

// ---------------------------------------------------------------------------
// Normalized surfaces
// ---------------------------------------------------------------------------

/**
 * A registry surface reduced to the facts the importer acts on. `slug` is the
 * stable per-domain identity — it seeds the connector id and tool prefix and is
 * persisted so a domain's surface can only be imported once.
 */
export interface RegistrySurface {
  auth: RegistrySurfaceAuth;
  /** MCP connect endpoint, or the HTTP API's base URL. */
  connect_url: string | null;
  docs: string | null;
  kind: string;
  name: string | null;
  required_headers: RegistryRequiredHeader[];
  slug: string;
  spec: string | null;
  spec_alternates: string[];
  spec_overrides: JsonPatchOperation[];
  transports: string[];
  variables: RegistryVariable[];
}

/**
 * One registry surface as an import candidate. `blocked_reason` is non-null
 * when the surface is listed but cannot be imported — the console shows it
 * rather than silently dropping the row.
 */
export interface ImportableSource {
  blocked_reason: string | null;
  source_kind: ExternalSourceKind;
  source_url: string;
  surface: RegistrySurface;
  /** Transport used at invoke time; null for openapi sources. */
  transport: McpTransport | null;
}

function normalizeSurface(
  surface: z.infer<typeof surfaceSchema>
): RegistrySurface | null {
  if (!surface.slug) {
    // Without a slug the surface has no stable identity to persist against.
    return null;
  }
  return {
    auth: surface.auth ?? { entries: [], status: "unknown" },
    connect_url: surface.url ?? null,
    docs: surface.docs ?? null,
    kind: surface.type,
    name: surface.name ?? null,
    required_headers: surface.requiredHeaders,
    slug: surface.slug,
    spec: surface.spec ?? null,
    spec_alternates: surface.specAlternates,
    spec_overrides: surface.specOverrides,
    transports: surface.transports ?? [],
    variables: surface.variables,
  };
}

/** Every slugged surface on the domain, in registry order. */
export function registrySurfaces(
  payload: RegistryDiscoverPayload
): RegistrySurface[] {
  return payload.surfaces
    .map(normalizeSurface)
    .filter((surface): surface is RegistrySurface => surface !== null);
}

/**
 * Transport to speak to an MCP surface. A surface that declares transports but
 * no remote one (stdio-only) is not importable; an undeclared transport means
 * the registry never probed it, and streamable HTTP is the remote default the
 * adapter falls back from anyway.
 */
export function resolveMcpTransport(
  surface: Pick<RegistrySurface, "transports">
): McpTransport | null {
  if (surface.transports.length === 0) {
    return "streamable-http";
  }
  if (surface.transports.includes("streamable-http")) {
    return "streamable-http";
  }
  return surface.transports.includes("sse") ? "sse" : null;
}

/**
 * Registry surfaces as import candidates. HTTP surfaces need an OpenAPI spec
 * (a bare base URL describes no operations); MCP surfaces need a supported
 * remote transport. GraphQL and CLI surfaces are out of scope for this module
 * and are listed with a reason rather than hidden.
 */
export function discoverImportableSources(
  payload: RegistryDiscoverPayload
): ImportableSource[] {
  const sources: ImportableSource[] = [];
  for (const surface of registrySurfaces(payload)) {
    if (surface.kind === "http") {
      sources.push({
        blocked_reason: surface.spec
          ? null
          : "the registry lists no OpenAPI spec for this API — paste a spec URL on the Manual URL tab",
        source_kind: "openapi",
        source_url: surface.spec ?? surface.connect_url ?? "",
        surface,
        transport: null,
      });
      continue;
    }
    if (surface.kind === "mcp") {
      const transport = resolveMcpTransport(surface);
      // Transport first: a stdio-only server has no connect URL *because* it
      // is not a remote server, and naming the transport says more.
      let blocked: string | null = null;
      if (!transport) {
        blocked = `unsupported MCP transport (${surface.transports.join(", ")}) — only streamable-http and sse can be imported`;
      } else if (!surface.connect_url) {
        blocked = "the registry lists no connect URL for this MCP server";
      }
      sources.push({
        blocked_reason: blocked,
        source_kind: "mcp",
        source_url: surface.connect_url ?? "",
        surface,
        transport,
      });
      continue;
    }
    sources.push({
      blocked_reason: `${surface.kind} surfaces cannot be imported — this module covers OpenAPI and MCP`,
      source_kind: "openapi",
      source_url: surface.connect_url ?? "",
      surface,
      transport: null,
    });
  }
  return sources;
}

/**
 * Re-derive the registry surface a source URL belongs to. Import calls this
 * server-side from `domain` + `source_url` instead of trusting slug/override
 * metadata echoed back by the client.
 */
export function findSurfaceForSource(
  payload: RegistryDiscoverPayload,
  sourceUrl: string
): RegistrySurface | null {
  const wanted = sourceUrl.trim();
  for (const surface of registrySurfaces(payload)) {
    const candidates = [
      surface.spec,
      ...surface.spec_alternates,
      surface.connect_url,
    ].filter((value): value is string => Boolean(value));
    if (candidates.some((value) => value === wanted)) {
      return surface;
    }
  }
  return null;
}

/** Discovered OAuth facts (nested under `detect.auth`). */
export function discoverOAuthFacts(
  payload: RegistryDiscoverPayload
): RegistryOAuthFacts | null {
  return payload.detect?.auth?.oauth ?? null;
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

async function fetchJson(
  url: string,
  fetchImpl: typeof fetch
): Promise<unknown> {
  const response = await fetchImpl(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`registry request failed (${response.status}): ${url}`);
  }
  return await response.json();
}

/**
 * The registry host comes from `ENGENTY_INTEGRATIONS_REGISTRY_URL` — settings
 * input, so it goes through the guard like every other outbound URL here.
 */
function defaultRegistryFetch(): typeof fetch {
  return createGuardedFetch();
}

export async function registrySearch(
  params: { kind?: ExternalSourceKind; limit?: number; query: string },
  fetchImpl: typeof fetch = defaultRegistryFetch()
): Promise<RegistrySearchResult[]> {
  const url = new URL(`${registryBaseUrl()}/api/search`);
  url.searchParams.set("q", params.query);
  if (params.kind) {
    url.searchParams.set("kind", params.kind);
  }
  url.searchParams.set("limit", String(params.limit ?? 20));
  const data = await fetchJson(url.toString(), fetchImpl);
  return parseSearchResponse(data);
}

/**
 * Load the registry's cached surface document for a domain (same facts as
 * https://integrations.sh/{domain}/). Named "discover" for historical call
 * sites; the upstream path is `/surface`, not the live `/discover` probe.
 */
export async function registryDiscover(
  domain: string,
  fetchImpl: typeof fetch = defaultRegistryFetch()
): Promise<{ parsed: RegistryDiscoverPayload; raw: Record<string, unknown> }> {
  const safeDomain = encodeURIComponent(domain.trim().toLowerCase());
  const data = await fetchJson(
    `${registryBaseUrl()}/api/${safeDomain}/surface`,
    fetchImpl
  );
  return {
    parsed: parseSurfacePayload(data),
    raw: (data ?? {}) as Record<string, unknown>,
  };
}

export { SUPPORTED_MCP_TRANSPORTS };
