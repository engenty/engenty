import {
  findSurfaceForSource,
  type JsonPatchOperation,
  type RegistryDiscoverPayload,
  type RegistrySearchSurface,
  type RegistrySurface,
  registryDiscover,
  registrySearch,
} from "./registry-client.js";

/**
 * The registry publishes a service's surfaces twice: the per-domain catalog
 * document (`/api/{domain}/surface`) carries the rich facts — required
 * headers, URL variables, transports, credential mechanics — while the search
 * catalog carries a summary per surface, and today it is the search view that
 * carries the `specOverrides` corrections. Neither is a superset.
 *
 * `resolveRegistrySource` takes the two facts the caller is allowed to supply
 * — domain and source URL — and re-derives one surface from both views by
 * exact URL match. Nothing is matched fuzzily: a correction published against
 * one spec URL is never applied to a different one.
 */

/** Catalog `kind` values mapped onto surface-document `type` values. */
function catalogKindToSurfaceKind(kind: string): string {
  return kind === "openapi" ? "http" : kind;
}

/** A search-catalog surface expressed in the surface-document shape. */
function surfaceFromCatalog(
  entry: RegistrySearchSurface
): RegistrySurface | null {
  if (!entry.url) {
    return null;
  }
  const kind = catalogKindToSurfaceKind(entry.kind);
  return {
    auth: {
      entries: [],
      // The catalog states only whether a credential is needed, never how it
      // rides the request — `mapAuth` falls back to the spec and OAuth facts.
      status: entry.auth?.kind === "none" ? "none" : "unknown",
    },
    connect_url: kind === "http" ? null : entry.url,
    docs: null,
    kind,
    name: null,
    required_headers: [],
    slug: entry.slug,
    spec: kind === "http" ? entry.url : null,
    spec_alternates: [],
    spec_overrides: entry.specOverrides,
    transports: [],
    variables: [],
  };
}

function catalogSurfacesForDomain(
  results: Array<{ domain: string; surfaces: RegistrySearchSurface[] }>,
  domain: string
): RegistrySearchSurface[] {
  const wanted = domain.trim().toLowerCase();
  return results
    .filter((result) => result.domain.trim().toLowerCase() === wanted)
    .flatMap((result) => result.surfaces);
}

export interface ResolvedRegistrySource {
  discover: {
    parsed: RegistryDiscoverPayload;
    raw: Record<string, unknown>;
  } | null;
  /** null when neither view lists a surface at this URL (manual import). */
  surface: RegistrySurface | null;
}

/**
 * Resolve the registry surface behind `sourceUrl`. Registry lookups are best
 * effort: a registry outage degrades an import to a plain URL import rather
 * than failing it.
 */
export async function resolveRegistrySource(params: {
  domain: string;
  fetchImpl?: typeof fetch;
  sourceUrl: string;
}): Promise<ResolvedRegistrySource> {
  const [discover, searchResults] = await Promise.all([
    registryDiscover(params.domain, params.fetchImpl).catch(() => null),
    registrySearch({ limit: 10, query: params.domain }, params.fetchImpl).catch(
      () => []
    ),
  ]);

  const documentSurface = discover
    ? findSurfaceForSource(discover.parsed, params.sourceUrl)
    : null;
  const catalogEntry = catalogSurfacesForDomain(
    searchResults,
    params.domain
  ).find((entry) => entry.url === params.sourceUrl.trim());

  if (!documentSurface) {
    return {
      discover,
      surface: catalogEntry ? surfaceFromCatalog(catalogEntry) : null,
    };
  }
  if (documentSurface.spec_overrides.length > 0 || !catalogEntry) {
    return { discover, surface: documentSurface };
  }
  // Same URL in both views: take the document's facts and the catalog's
  // corrections.
  return {
    discover,
    surface: {
      ...documentSurface,
      spec_overrides: catalogEntry.specOverrides as JsonPatchOperation[],
    },
  };
}
