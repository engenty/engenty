import { z } from "zod";

/**
 * Client for an integrations.sh-compatible registry. Contacted ONLY during
 * admin import/refresh — never at agent runtime. The registry self-describes
 * as early-stage (payload `version: 3`, project v0.0.x), so parsing is
 * deliberately loose: we validate just the branches we consume and persist the
 * raw payload on the imported record for forensics.
 *
 * Prefer `GET /api/{domain}/surface` (cached catalog document shown on the
 * public registry page) over `/discover` (live re-probe — often hangs past our
 * request timeout while `/surface` returns in hundreds of ms).
 */

const DEFAULT_REGISTRY_URL = "https://integrations.sh";
const REQUEST_TIMEOUT_MS = 20_000;

export function registryBaseUrl(): string {
  return (
    process.env.ENGENTY_INTEGRATIONS_REGISTRY_URL ?? DEFAULT_REGISTRY_URL
  ).replace(/\/+$/u, "");
}

const searchResultSchema = z.object({
  description: z.string().default(""),
  domain: z.string(),
  kinds: z.array(z.string()).default([]),
  name: z.string(),
  url: z.string().default(""),
});

const searchResponseSchema = z.object({
  results: z.array(searchResultSchema).default([]),
});

export type RegistrySearchResult = z.infer<typeof searchResultSchema>;

const oauthFactsSchema = z
  .object({
    authorizationEndpoint: z.string().optional(),
    dcr: z.boolean().optional(),
    grantTypes: z.array(z.string()).default([]),
    scopes: z.array(z.string()).default([]),
    tokenEndpoint: z.string().optional(),
  })
  .loose();

const mcpFactsSchema = z
  .object({
    auth: z.string().optional(),
    authorizationServer: z.string().optional(),
    dcr: z.boolean().optional(),
    url: z.string(),
  })
  .loose();

/**
 * Payload shape (v3): machine-probed facts nest under `detect` (apiCatalog,
 * auth, mcp); a curated top-level `surfaces[]` lists REST base URLs (`http`,
 * not importable — no spec document) and MCP endpoints (`mcp`, importable).
 */
const discoverSchema = z
  .object({
    detect: z
      .object({
        apiCatalog: z
          .object({
            docs: z.array(z.string()).default([]),
            mcp: z.array(z.string()).default([]),
            openapi: z.array(z.string()).default([]),
            rest: z.array(z.string()).default([]),
          })
          .loose()
          .nullish(),
        auth: z.object({ oauth: oauthFactsSchema.nullish() }).loose().nullish(),
        mcp: z.array(mcpFactsSchema).default([]),
      })
      .loose()
      .nullish(),
    domain: z.string(),
    surfaces: z
      .array(z.object({ type: z.string(), url: z.string().nullish() }).loose())
      .default([]),
    version: z.number().optional(),
  })
  .loose();

export type RegistryDiscoverPayload = z.infer<typeof discoverSchema>;

export interface ImportableSource {
  auth_hint?: string | null;
  source_kind: "openapi" | "mcp";
  source_url: string;
}

/** Deduped importable sources across surfaces + detect facts. */
export function discoverImportableSources(
  payload: RegistryDiscoverPayload
): ImportableSource[] {
  const sources: ImportableSource[] = [
    ...(payload.detect?.apiCatalog?.openapi ?? []).map((url) => ({
      source_kind: "openapi" as const,
      source_url: url,
    })),
    ...payload.surfaces
      .filter((surface) => surface.type === "mcp" && surface.url)
      .map((surface) => ({
        source_kind: "mcp" as const,
        source_url: surface.url as string,
      })),
    ...(payload.detect?.mcp ?? []).map((entry) => ({
      auth_hint: entry.auth ?? null,
      source_kind: "mcp" as const,
      source_url: entry.url,
    })),
    ...(payload.detect?.apiCatalog?.mcp ?? []).map((url) => ({
      source_kind: "mcp" as const,
      source_url: url,
    })),
  ];
  return sources.filter(
    (entry, index, all) =>
      all.findIndex((e) => e.source_url === entry.source_url) === index
  );
}

/** Discovered OAuth facts (nested under detect since payload v3). */
export function discoverOAuthFacts(
  payload: RegistryDiscoverPayload
): z.infer<typeof oauthFactsSchema> | null {
  return payload.detect?.auth?.oauth ?? null;
}

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

export async function registrySearch(
  params: { kind?: "mcp" | "openapi"; limit?: number; query: string },
  fetchImpl: typeof fetch = fetch
): Promise<RegistrySearchResult[]> {
  const url = new URL(`${registryBaseUrl()}/api/search`);
  url.searchParams.set("q", params.query);
  if (params.kind) {
    url.searchParams.set("kind", params.kind);
  }
  url.searchParams.set("limit", String(params.limit ?? 20));
  const data = await fetchJson(url.toString(), fetchImpl);
  return searchResponseSchema.parse(data).results;
}

/**
 * Load the registry's cached surface document for a domain (same facts as
 * https://integrations.sh/{domain}/). Named "discover" for historical call
 * sites; upstream path is `/surface`, not the live `/discover` probe.
 */
export async function registryDiscover(
  domain: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ parsed: RegistryDiscoverPayload; raw: Record<string, unknown> }> {
  const safeDomain = encodeURIComponent(domain.trim().toLowerCase());
  const data = await fetchJson(
    `${registryBaseUrl()}/api/${safeDomain}/surface`,
    fetchImpl
  );
  return {
    parsed: discoverSchema.parse(data),
    raw: (data ?? {}) as Record<string, unknown>,
  };
}
