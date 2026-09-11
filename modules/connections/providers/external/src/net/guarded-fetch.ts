import { assertPublicHttpHost, type LookupFn } from "@engenty/web-ingest";

/**
 * Every network call this module makes reaches a URL that came from the
 * registry, an admin-pasted field, or a stored import record — attacker
 * influenceable in all three cases. `createGuardedFetch` is the single way out:
 * it validates the host (DNS-resolved, private/link-local ranges blocked)
 * before the first request and again before following each redirect.
 *
 * `safeFetchFollowingRedirects` in `@engenty/web-ingest` covers GET/HEAD only;
 * the MCP transport POSTs JSON-RPC bodies and DELETEs sessions, so the redirect
 * chain is walked here with method and body carried the way the HTTP spec
 * prescribes (307/308 replay, 301/302/303 downgrade to GET).
 */

const DEFAULT_MAX_REDIRECTS = 5;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** Redirects that must not replay the original method and body. */
const DOWNGRADE_TO_GET = new Set([301, 302, 303]);

export interface GuardedFetchOptions {
  /** Injectable for tests; defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Injectable DNS lookup for tests; defaults to `node:dns/promises`. */
  lookupImpl?: LookupFn;
  /** Cap on redirect hops before giving up. Defaults to 5. */
  maxRedirects?: number;
}

/** A `fetch` drop-in that refuses private/non-HTTP targets on every hop. */
export function createGuardedFetch(
  options?: GuardedFetchOptions
): typeof fetch {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const maxRedirects = options?.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    let currentUrl = typeof input === "string" ? input : String(input);
    let currentInit: RequestInit = { ...init, redirect: "manual" };
    let hops = 0;

    await assertPublicHttpHost(currentUrl, options?.lookupImpl);

    while (true) {
      const response = await fetchImpl(currentUrl, currentInit);
      if (!REDIRECT_STATUSES.has(response.status)) {
        return response;
      }

      hops += 1;
      if (hops > maxRedirects) {
        throw new Error(
          `Too many redirects (max ${maxRedirects}) following ${currentUrl}`
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
      await assertPublicHttpHost(nextUrl, options?.lookupImpl);

      if (DOWNGRADE_TO_GET.has(response.status)) {
        currentInit = { ...currentInit, body: undefined, method: "GET" };
      } else if (
        currentInit.body !== undefined &&
        currentInit.body !== null &&
        typeof currentInit.body !== "string"
      ) {
        // A stream body cannot be replayed; refuse rather than send a
        // truncated request to a host we were redirected to.
        throw new Error(
          `Cannot follow HTTP ${response.status} redirect: request body is not replayable`
        );
      }
      currentUrl = nextUrl;
    }
  }) as typeof fetch;
}

export class SpecTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpecTooLargeError";
  }
}

/**
 * GET a text document through the guard, refusing oversize payloads *before*
 * reading them: `content-length` is checked first, then the body is consumed
 * chunk by chunk and abandoned the moment it crosses `maxBytes`.
 */
export async function fetchTextBounded(params: {
  fetchImpl: typeof fetch;
  headers?: Record<string, string>;
  maxBytes: number;
  signal?: AbortSignal;
  url: string;
}): Promise<string> {
  const response = await params.fetchImpl(params.url, {
    ...(params.headers ? { headers: params.headers } : {}),
    ...(params.signal ? { signal: params.signal } : {}),
  });
  if (!response.ok) {
    throw new Error(`spec fetch failed (${response.status}): ${params.url}`);
  }

  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > params.maxBytes) {
    throw new SpecTooLargeError(
      `spec too large (${declared} bytes > ${params.maxBytes}); import a smaller spec or use a filtered variant`
    );
  }

  const body = response.body;
  if (!body) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > params.maxBytes) {
      throw new SpecTooLargeError(
        `spec too large (> ${params.maxBytes} bytes); import a smaller spec or use a filtered variant`
      );
    }
    return text;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }
      total += value.byteLength;
      if (total > params.maxBytes) {
        throw new SpecTooLargeError(
          `spec too large (> ${params.maxBytes} bytes); import a smaller spec or use a filtered variant`
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
    await body.cancel().catch(() => {
      // Already drained or errored — nothing to release.
    });
  }
  return Buffer.concat(chunks).toString("utf8");
}
