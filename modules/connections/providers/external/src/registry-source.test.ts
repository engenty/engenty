import { afterEach, describe, expect, it, vi } from "vitest";
import searchJson from "./__fixtures__/registry-search.json" with {
  type: "json",
};
import surfacesJson from "./__fixtures__/registry-surfaces.json" with {
  type: "json",
};
import { resolveRegistrySource } from "./registry-source.js";

/**
 * Serves the recorded registry payloads over a fake fetch, so the merge of
 * `/api/{domain}/surface` and `/api/search` runs the same code path as
 * production without touching the network.
 */
function registryFetch(options: {
  search?: unknown;
  surface?: unknown;
}): typeof fetch {
  return vi.fn(async (input: unknown) => {
    const url = String(input);
    const body = url.includes("/api/search") ? options.search : options.surface;
    if (body === undefined) {
      return new Response("not found", { status: 404 });
    }
    return new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  }) as unknown as typeof fetch;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveRegistrySource", () => {
  it("resolves an HTTP surface from the surface document by its spec URL", async () => {
    const { surface } = await resolveRegistrySource({
      domain: "stripe.com",
      fetchImpl: registryFetch({
        search: searchJson.stripe,
        surface: surfacesJson.stripe,
      }),
      sourceUrl:
        "https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json",
    });
    expect(surface?.slug).toBe("stripe-api");
    expect(surface?.connect_url).toBe("https://api.stripe.com");
  });

  it("falls back to the search catalog when the surface document has no such URL", async () => {
    // Figma publishes its spec under two URLs; only the catalog lists the
    // `refs/heads/main` one — together with the corrections for it.
    const { surface } = await resolveRegistrySource({
      domain: "figma.com",
      fetchImpl: registryFetch({ search: searchJson.figma }),
      sourceUrl:
        "https://raw.githubusercontent.com/figma/rest-api-spec/refs/heads/main/openapi/openapi.yaml",
    });
    expect(surface?.slug).toBe("figma-com");
    expect(surface?.kind).toBe("http");
    expect(surface?.spec_overrides).toHaveLength(1);
    expect(surface?.spec_overrides[0]).toMatchObject({ op: "replace" });
  });

  it("returns no surface for a URL neither view lists", async () => {
    const { surface } = await resolveRegistrySource({
      domain: "stripe.com",
      fetchImpl: registryFetch({
        search: searchJson.stripe,
        surface: surfacesJson.stripe,
      }),
      sourceUrl: "https://example.com/openapi.json",
    });
    expect(surface).toBeNull();
  });

  it("degrades to a plain URL import when the registry is unreachable", async () => {
    const failing = vi.fn(async () => {
      throw new Error("registry down");
    }) as unknown as typeof fetch;
    const resolved = await resolveRegistrySource({
      domain: "stripe.com",
      fetchImpl: failing,
      sourceUrl: "https://api.stripe.com/openapi.json",
    });
    expect(resolved).toEqual({ discover: null, surface: null });
  });
});
