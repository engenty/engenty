import { describe, expect, it, vi } from "vitest";
import {
  createGuardedFetch,
  fetchTextBounded,
  SpecTooLargeError,
} from "./guarded-fetch.js";

/** DNS stub: every name resolves to whatever the test says. */
const lookupTo = (address: string) =>
  vi.fn(async () => [{ address, family: address.includes(":") ? 6 : 4 }]);

const publicLookup = lookupTo("93.184.216.34");

function respondWith(responses: Response[]): typeof fetch {
  let index = 0;
  return vi.fn(async () => {
    const response = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return response;
  }) as unknown as typeof fetch;
}

const ok = () => new Response("{}", { status: 200 });

const redirectTo = (location: string, status = 302) =>
  new Response(null, { headers: { location }, status });

describe("createGuardedFetch", () => {
  it("passes a public host through", async () => {
    const inner = respondWith([ok()]);
    const guarded = createGuardedFetch({
      fetchImpl: inner,
      lookupImpl: publicLookup,
    });
    const response = await guarded("https://api.example.com/openapi.json");
    expect(response.status).toBe(200);
  });

  it("refuses a literal private address", async () => {
    const guarded = createGuardedFetch({ fetchImpl: respondWith([ok()]) });
    await expect(guarded("http://192.168.1.10/openapi.json")).rejects.toThrow(
      /not allowed for fetch/u
    );
  });

  it("refuses localhost and cloud metadata by name", async () => {
    const guarded = createGuardedFetch({ fetchImpl: respondWith([ok()]) });
    await expect(guarded("http://localhost:8080/mcp")).rejects.toThrow(
      /not allowed for fetch/u
    );
    await expect(
      guarded("http://metadata.google.internal/computeMetadata/v1/")
    ).rejects.toThrow(/not allowed for fetch/u);
  });

  it("refuses a public name that resolves to a private address", async () => {
    const guarded = createGuardedFetch({
      fetchImpl: respondWith([ok()]),
      lookupImpl: lookupTo("169.254.169.254"),
    });
    await expect(guarded("https://rebind.example.com/mcp")).rejects.toThrow(
      /resolves to a blocked IP/u
    );
  });

  it("refuses non-http schemes", async () => {
    const guarded = createGuardedFetch({ fetchImpl: respondWith([ok()]) });
    await expect(guarded("file:///etc/passwd")).rejects.toThrow(
      /Only http and https/u
    );
  });

  it("validates the redirect target, not just the first hop", async () => {
    const inner = respondWith([redirectTo("http://169.254.169.254/latest")]);
    const guarded = createGuardedFetch({
      fetchImpl: inner,
      lookupImpl: publicLookup,
    });
    await expect(guarded("https://api.example.com/spec.json")).rejects.toThrow(
      /not allowed for fetch/u
    );
  });

  it("follows a redirect to another public host", async () => {
    const inner = respondWith([
      redirectTo("https://cdn.example.com/spec.json"),
      new Response("spec", { status: 200 }),
    ]);
    const guarded = createGuardedFetch({
      fetchImpl: inner,
      lookupImpl: publicLookup,
    });
    const response = await guarded("https://api.example.com/spec.json");
    expect(await response.text()).toBe("spec");
  });

  it("gives up on a redirect loop", async () => {
    const inner = respondWith([
      redirectTo("https://api.example.com/spec.json"),
    ]);
    const guarded = createGuardedFetch({
      fetchImpl: inner,
      lookupImpl: publicLookup,
      maxRedirects: 2,
    });
    await expect(guarded("https://api.example.com/spec.json")).rejects.toThrow(
      /Too many redirects/u
    );
  });

  it("downgrades a POST to GET across a 303, keeping the body off the wire", async () => {
    const calls: RequestInit[] = [];
    const inner = vi.fn(async (_url: unknown, init?: RequestInit) => {
      calls.push(init ?? {});
      return calls.length === 1
        ? redirectTo("https://mcp.example.com/session", 303)
        : ok();
    }) as unknown as typeof fetch;
    const guarded = createGuardedFetch({
      fetchImpl: inner,
      lookupImpl: publicLookup,
    });
    await guarded("https://mcp.example.com/mcp", {
      body: JSON.stringify({ method: "initialize" }),
      method: "POST",
    });
    expect(calls[1]?.method).toBe("GET");
    expect(calls[1]?.body).toBeUndefined();
  });

  it("replays method and body across a 307", async () => {
    const calls: RequestInit[] = [];
    const inner = vi.fn(async (_url: unknown, init?: RequestInit) => {
      calls.push(init ?? {});
      return calls.length === 1
        ? redirectTo("https://mcp.example.com/v2", 307)
        : ok();
    }) as unknown as typeof fetch;
    const guarded = createGuardedFetch({
      fetchImpl: inner,
      lookupImpl: publicLookup,
    });
    await guarded("https://mcp.example.com/mcp", {
      body: '{"method":"tools/list"}',
      method: "POST",
    });
    expect(calls[1]?.method).toBe("POST");
    expect(calls[1]?.body).toBe('{"method":"tools/list"}');
  });

  it("never lets the inner fetch follow redirects itself", async () => {
    const calls: RequestInit[] = [];
    const inner = vi.fn(async (_url: unknown, init?: RequestInit) => {
      calls.push(init ?? {});
      return ok();
    }) as unknown as typeof fetch;
    const guarded = createGuardedFetch({
      fetchImpl: inner,
      lookupImpl: publicLookup,
    });
    await guarded("https://api.example.com/spec.json");
    expect(calls[0]?.redirect).toBe("manual");
  });
});

describe("fetchTextBounded", () => {
  const guarded = (response: Response) =>
    createGuardedFetch({
      fetchImpl: respondWith([response]),
      lookupImpl: publicLookup,
    });

  it("returns a small document", async () => {
    const text = await fetchTextBounded({
      fetchImpl: guarded(new Response("openapi: 3.0.0", { status: 200 })),
      maxBytes: 1024,
      url: "https://api.example.com/spec.yaml",
    });
    expect(text).toBe("openapi: 3.0.0");
  });

  it("refuses on content-length before reading the body", async () => {
    const body = vi.fn();
    const response = new Response("x".repeat(10), {
      headers: { "content-length": "9999999" },
      status: 200,
    });
    await expect(
      fetchTextBounded({
        fetchImpl: guarded(response),
        maxBytes: 1024,
        url: "https://api.example.com/spec.json",
      })
    ).rejects.toBeInstanceOf(SpecTooLargeError);
    expect(body).not.toHaveBeenCalled();
  });

  it("refuses a body that outgrows the cap mid-stream", async () => {
    // No content-length: the cap must hold while the body streams in.
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 10; i++) {
          controller.enqueue(new TextEncoder().encode("x".repeat(100)));
        }
        controller.close();
      },
    });
    await expect(
      fetchTextBounded({
        fetchImpl: guarded(new Response(stream, { status: 200 })),
        maxBytes: 250,
        url: "https://api.example.com/spec.json",
      })
    ).rejects.toBeInstanceOf(SpecTooLargeError);
  });

  it("surfaces a non-2xx spec response", async () => {
    await expect(
      fetchTextBounded({
        fetchImpl: guarded(new Response("nope", { status: 404 })),
        maxBytes: 1024,
        url: "https://api.example.com/spec.json",
      })
    ).rejects.toThrow(/spec fetch failed \(404\)/u);
  });

  it("refuses a spec URL pointing at a private host", async () => {
    await expect(
      fetchTextBounded({
        fetchImpl: createGuardedFetch({ fetchImpl: respondWith([ok()]) }),
        maxBytes: 1024,
        url: "http://10.0.0.5/openapi.json",
      })
    ).rejects.toThrow(/not allowed for fetch/u);
  });
});
