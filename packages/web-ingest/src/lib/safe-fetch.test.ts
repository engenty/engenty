import { describe, expect, it, vi } from "vitest";
import { safeFetchFollowingRedirects } from "./safe-fetch.js";
import type { LookupFn } from "./ssrf.js";

/**
 * The point of these tests: validating only the FIRST url is not enough. A
 * public host that 302s into link-local space must be refused at the hop, and
 * the request to the blocked address must never be issued.
 */

function redirectTo(location: string, status = 302): Response {
  return new Response(null, { headers: { location }, status });
}

describe("safeFetchFollowingRedirects", () => {
  it("refuses a redirect into link-local space and never fetches it", async () => {
    const fetchImpl = vi
      .fn<(input: string, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        redirectTo("http://169.254.169.254/latest/meta-data/")
      );

    await expect(
      safeFetchFollowingRedirects("http://93.184.216.34/start", { fetchImpl })
    ).rejects.toThrow(/not allowed for fetch|blocked/i);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("http://93.184.216.34/start");
  });

  it("refuses a redirect to a private RFC1918 address", async () => {
    const fetchImpl = vi
      .fn<(input: string, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(redirectTo("http://10.0.0.5/admin"));

    await expect(
      safeFetchFollowingRedirects("http://93.184.216.34/start", { fetchImpl })
    ).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("follows a redirect between public hosts and reports the final url", async () => {
    const fetchImpl = vi
      .fn<(input: string, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(redirectTo("http://93.184.216.35/next"))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const { finalUrl, response } = await safeFetchFollowingRedirects(
      "http://93.184.216.34/start",
      { fetchImpl }
    );

    expect(response.status).toBe(200);
    expect(finalUrl).toBe("http://93.184.216.35/next");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("never lets fetch follow redirects on its own", async () => {
    const fetchImpl = vi
      .fn<(input: string, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValue(new Response("ok", { status: 200 }));

    await safeFetchFollowingRedirects("http://93.184.216.34/x", { fetchImpl });

    expect(fetchImpl.mock.calls[0]?.[1]?.redirect).toBe("manual");
  });

  it("rejects the initial url when it is already blocked", async () => {
    const fetchImpl =
      vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

    await expect(
      safeFetchFollowingRedirects("http://127.0.0.1/x", { fetchImpl })
    ).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("gives up after too many redirects", async () => {
    const fetchImpl = vi
      .fn<(input: string, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValue(redirectTo("http://93.184.216.34/loop"));

    await expect(
      safeFetchFollowingRedirects("http://93.184.216.34/loop", {
        fetchImpl,
        maxRedirects: 2,
      })
    ).rejects.toThrow(/Too many redirects/);
  });

  it("rejects a redirect with no Location header", async () => {
    const fetchImpl = vi
      .fn<(input: string, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(new Response(null, { status: 302 }));

    await expect(
      safeFetchFollowingRedirects("http://93.184.216.34/x", { fetchImpl })
    ).rejects.toThrow(/missing Location header/);
  });

  it("passes the requested method through to every hop", async () => {
    const fetchImpl = vi
      .fn<(input: string, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValue(new Response(null, { status: 200 }));

    await safeFetchFollowingRedirects("http://93.184.216.34/x", {
      fetchImpl,
      method: "HEAD",
    });

    expect(fetchImpl.mock.calls[0]?.[1]?.method).toBe("HEAD");
  });
});

/**
 * A name-based check would pass this: the hostname is not a private literal,
 * it merely RESOLVES to one. This is the gap that made the legacy guard unsafe.
 */
describe("safeFetchFollowingRedirects — DNS-resolved hosts", () => {
  it("blocks a public-looking hostname that resolves to a private address", async () => {
    const lookup: LookupFn = async () => [{ address: "10.0.0.7", family: 4 }];
    const fetchImpl =
      vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

    await expect(
      safeFetchFollowingRedirects("http://internal.example.com/x", {
        fetchImpl,
        lookupImpl: lookup,
      })
    ).rejects.toThrow(/blocked IP/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
