/**
 * SSRF protection for server-side URL fetching.
 *
 * `assertPublicHttpHost` is the ONE guard — it resolves the hostname via DNS and
 * validates every returned address with `isBlockedIp`. The literal-hostname
 * check is its internal fast path, deliberately NOT exported: a string-only
 * check passes any name that resolves to a private address, so exporting it
 * invites call sites that look guarded and aren't (it was the sole guard on two
 * fetch paths until 2026-08-04 — see TRK-01).
 *
 * Residual risk: DNS rebinding / TOCTOU window between resolution here and the
 * actual TCP connect.  The proper mitigation is to hook into the HTTP client's
 * connect phase (e.g. undici `connect.lookup`). That is tracked as a follow-up.
 */

// No top-level node:* imports: this module reaches browser bundles through the
// `@engenty/web-ingest` barrel (document-sources adapters → module UI plugins),
// so IP classification is implemented in pure JS instead of `node:net.isIP`.

const IPV4_PATTERN =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

function isValidIpv6(ip: string): boolean {
  const halves = ip.split("::");
  if (halves.length > 2) {
    return false;
  }
  const hasDoubleColon = halves.length === 2;
  const head = halves[0] === "" ? [] : halves[0]!.split(":");
  const tail = hasDoubleColon && halves[1] !== "" ? halves[1]!.split(":") : [];
  const groups = [...head, ...tail];
  let wordCount = 0;
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i]!;
    // Embedded IPv4 (e.g. ::ffff:192.168.1.1) is only valid as the last group.
    if (i === groups.length - 1 && group.includes(".")) {
      if (!IPV4_PATTERN.test(group)) {
        return false;
      }
      wordCount += 2;
      continue;
    }
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) {
      return false;
    }
    wordCount += 1;
  }
  return hasDoubleColon ? wordCount < 8 : wordCount === 8;
}

/** Pure equivalent of `node:net.isIP`: 4, 6, or 0 when not a valid IP literal. */
function isIP(ip: string): 0 | 4 | 6 {
  if (IPV4_PATTERN.test(ip)) {
    return 4;
  }
  return isValidIpv6(ip) ? 6 : 0;
}

// ---------------------------------------------------------------------------
// Literal-hostname fast path — internal to assertPublicHttpHost, never exported
// ---------------------------------------------------------------------------

/** Block obvious SSRF targets by name, before any DNS work. */
function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) {
    return true;
  }
  if (h === "metadata" || h === "metadata.google.internal") {
    return true;
  }
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) {
    return true;
  }
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) {
    return true;
  }
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) {
    return true;
  }
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(h)) {
    return true;
  }
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(h)) {
    return true;
  }
  if (h === "[::1]" || h === "::1") {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// IP-level range check
// ---------------------------------------------------------------------------

function ipv4ToNumber(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) {
    return null;
  }
  let n = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) {
      return null;
    }
    n = n * 256 + octet;
  }
  return n;
}

function inCidr(ip: string, base: string, prefixLen: number): boolean {
  const a = ipv4ToNumber(ip);
  const b = ipv4ToNumber(base);
  if (a === null || b === null) {
    return false;
  }
  // biome-ignore lint/suspicious/noBitwiseOperators: intentional — CIDR mask arithmetic requires bitwise ops
  const mask = prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0;
  // biome-ignore lint/suspicious/noBitwiseOperators: intentional — CIDR mask arithmetic requires bitwise ops
  return (a & mask) >>> 0 === (b & mask) >>> 0;
}

/**
 * Returns true if the given IP address (v4 or v6) falls within a range that
 * must not be reached from a server-side fetch.
 */
export function isBlockedIp(ip: string): boolean {
  const kind = isIP(ip);

  if (kind === 4) {
    // 0.0.0.0/8
    if (inCidr(ip, "0.0.0.0", 8)) {
      return true;
    }
    // 10.0.0.0/8
    if (inCidr(ip, "10.0.0.0", 8)) {
      return true;
    }
    // 100.64.0.0/10 (carrier-grade NAT)
    if (inCidr(ip, "100.64.0.0", 10)) {
      return true;
    }
    // 127.0.0.0/8 (loopback)
    if (inCidr(ip, "127.0.0.0", 8)) {
      return true;
    }
    // 169.254.0.0/16 (link-local / cloud metadata)
    if (inCidr(ip, "169.254.0.0", 16)) {
      return true;
    }
    // 172.16.0.0/12
    if (inCidr(ip, "172.16.0.0", 12)) {
      return true;
    }
    // 192.168.0.0/16
    if (inCidr(ip, "192.168.0.0", 16)) {
      return true;
    }
    // 198.18.0.0/15 (benchmark / testing)
    if (inCidr(ip, "198.18.0.0", 15)) {
      return true;
    }
    // 224.0.0.0/3 (multicast + reserved: 224–255.x.x.x)
    if (inCidr(ip, "224.0.0.0", 3)) {
      return true;
    }
    return false;
  }

  if (kind === 6) {
    const lower = ip.toLowerCase();

    // ::1 (loopback)
    if (lower === "::1") {
      return true;
    }
    // :: (unspecified)
    if (lower === "::") {
      return true;
    }

    // fc00::/7 (unique-local: fc00:: – fdff::)
    // First 7 bits are 1111110x — covers fc00:: and fd00:: prefixes
    if (lower.startsWith("fc") || lower.startsWith("fd")) {
      return true;
    }

    // fe80::/10 (link-local)
    if (
      lower.startsWith("fe8") ||
      lower.startsWith("fe9") ||
      lower.startsWith("fea") ||
      lower.startsWith("feb")
    ) {
      return true;
    }

    // ::ffff:0:0/96 — IPv4-mapped; extract and re-check the embedded v4 address
    if (lower.startsWith("::ffff:")) {
      const v4Part = lower.slice("::ffff:".length);
      // Could be dotted-quad (::ffff:192.168.1.1) or hex word pair (::ffff:c0a8:0101)
      if (v4Part.includes(".")) {
        if (isBlockedIp(v4Part)) {
          return true;
        }
      } else {
        // Parse two hex words into dotted-quad
        const words = v4Part.split(":");
        if (words.length === 2) {
          const hi = Number.parseInt(words[0]!, 16);
          const lo = Number.parseInt(words[1]!, 16);
          if (!(Number.isNaN(hi) || Number.isNaN(lo))) {
            // biome-ignore lint/suspicious/noBitwiseOperators: intentional — extracting octets from 16-bit words
            const dotted = [hi >>> 8, hi & 0xff, lo >>> 8, lo & 0xff].join(".");
            if (isBlockedIp(dotted)) {
              return true;
            }
          }
        }
      }
    }

    return false;
  }

  // Not a valid IP — treat as blocked to be safe
  return true;
}

// ---------------------------------------------------------------------------
// Async DNS-resolving check
// ---------------------------------------------------------------------------

export type LookupFn = (
  hostname: string,
  options: { all: true; verbatim: true }
) => Promise<Array<{ address: string; family: number }>>;

/**
 * Validates `urlString` is a safe public HTTP(S) target:
 *  - Must be http: or https:
 *  - Hostname must pass `isBlockedHostname` (fast-path, no DNS)
 *  - If hostname is an IP literal, `isBlockedIp` is called directly
 *  - Otherwise DNS is resolved and *every* returned address is checked with `isBlockedIp`
 *
 * Returns the parsed URL and the list of resolved addresses on success.
 * Throws a descriptive Error on any violation.
 *
 * `lookupImpl` can be injected for testing; defaults to `dns/promises` lookup.
 */
export async function assertPublicHttpHost(
  urlString: string,
  lookupImpl?: LookupFn
): Promise<{ url: URL; addresses: string[] }> {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error(`Invalid URL: ${urlString}`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed");
  }

  const hostname = url.hostname;

  // Strip IPv6 brackets that URL parsing leaves in
  const hostForCheck =
    hostname.startsWith("[") && hostname.endsWith("]")
      ? hostname.slice(1, -1)
      : hostname;

  // Fast-path: blocked hostnames by name
  if (isBlockedHostname(hostname)) {
    throw new Error(`URL host is not allowed for fetch: ${hostname}`);
  }

  // If the hostname is an IP literal, skip DNS and check it directly
  if (isIP(hostForCheck) !== 0) {
    if (isBlockedIp(hostForCheck)) {
      throw new Error(`URL host is not allowed for fetch: ${hostname}`);
    }
    return { url, addresses: [hostForCheck] };
  }

  // Resolve via DNS and check every returned address
  let lookup: LookupFn;
  if (lookupImpl) {
    lookup = lookupImpl;
  } else {
    const dns = await import("node:dns/promises");
    lookup = dns.lookup as unknown as LookupFn;
  }

  let entries: Array<{ address: string; family: number }>;
  try {
    entries = await lookup(hostname, { all: true, verbatim: true });
  } catch (e) {
    throw new Error(
      `DNS resolution failed for ${hostname}: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  if (entries.length === 0) {
    throw new Error(`No DNS records found for ${hostname}`);
  }

  const addresses: string[] = [];
  for (const entry of entries) {
    if (isBlockedIp(entry.address)) {
      throw new Error(
        `URL host resolves to a blocked IP (${entry.address}): ${hostname}`
      );
    }
    addresses.push(entry.address);
  }

  return { url, addresses };
}
