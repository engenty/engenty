/**
 * The one way to fetch an attacker-influenced URL from the server.
 *
 * `assertPublicHttpHost` alone is not enough: a validated URL can still answer
 * with a 302 into 169.254.169.254, and `fetch`'s default `redirect: "follow"`
 * would take it. So every hop is validated and the chain is followed by hand.
 * Callers that reach the network with a URL from settings, model output, or
 * page content must go through here rather than calling `fetch` directly.
 */

import { assertPublicHttpHost, type LookupFn } from "./ssrf.js";

const DEFAULT_MAX_REDIRECTS = 5;

export type SafeFetchImpl = (
  input: string,
  init?: RequestInit
) => Promise<Response>;

export interface SafeFetchOptions {
  /** Injectable for tests; defaults to global `fetch`. */
  fetchImpl?: SafeFetchImpl;
  /** Extra request headers (e.g. Accept, User-Agent). */
  headers?: Record<string, string>;
  /** Injectable DNS lookup for tests; defaults to `node:dns/promises`. */
  lookupImpl?: LookupFn;
  /** Cap on redirect hops before giving up. Defaults to 5. */
  maxRedirects?: number;
  /** HTTP method. Defaults to GET; HEAD is the other useful one (probes). */
  method?: string;
  /** Abort signal covering the whole redirect chain. */
  signal?: AbortSignal;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * GETs `url`, validating the host before the first request and again before
 * following each redirect. Returns the final response and the URL it came from.
 * Throws when a hop resolves to a blocked address, the chain is too long, or a
 * redirect is malformed.
 */
export async function safeFetchFollowingRedirects(
  url: string,
  options?: SafeFetchOptions
): Promise<{ finalUrl: string; response: Response }> {
  const fetchFn = options?.fetchImpl ?? fetch;
  const maxRedirects = options?.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

  let currentUrl = url;
  let hops = 0;

  // Validate the initial URL before the first fetch.
  await assertPublicHttpHost(currentUrl, options?.lookupImpl);

  while (true) {
    const response = await fetchFn(currentUrl, {
      redirect: "manual",
      ...(options?.method ? { method: options.method } : {}),
      ...(options?.headers ? { headers: options.headers } : {}),
      ...(options?.signal ? { signal: options.signal } : {}),
    });

    if (!REDIRECT_STATUSES.has(response.status)) {
      return { finalUrl: currentUrl, response };
    }

    hops += 1;
    if (hops > maxRedirects) {
      throw new Error(
        `Too many redirects (max ${maxRedirects}) following ${url}`
      );
    }

    const location = response.headers.get("location");
    if (!location?.trim()) {
      throw new Error(
        `Redirect response (HTTP ${response.status}) missing Location header`
      );
    }

    let nextUrl: string;
    try {
      nextUrl = new URL(location, currentUrl).toString();
    } catch {
      throw new Error(`Malformed Location header in redirect: ${location}`);
    }

    // Validate the redirect target before following it.
    await assertPublicHttpHost(nextUrl, options?.lookupImpl);

    currentUrl = nextUrl;
  }
}
