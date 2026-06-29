import { describe, expect, it } from "vitest";

import { assertPublicHttpHost, isBlockedIp } from "./ssrf.js";

// ---------------------------------------------------------------------------
// isBlockedIp
// ---------------------------------------------------------------------------

describe("isBlockedIp — blocked IPv4", () => {
  it.each([
    "0.0.0.0",
    "0.255.255.255",
    "127.0.0.1",
    "127.255.255.255",
    "10.1.2.3",
    "10.0.0.1",
    "100.64.0.1",
    "100.127.255.255",
    "169.254.169.254",
    "169.254.0.1",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "192.168.255.0",
    "198.18.0.1",
    "198.19.255.255",
    "224.0.0.1",
    "239.255.255.255",
    "255.255.255.255",
  ])("blocks %s", (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });
});

describe("isBlockedIp — blocked IPv6", () => {
  it.each([
    "::1",
    "::",
    "fc00::1",
    "fd00::1",
    "fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
    "fe80::1",
    "fe90::1",
    "fea0::1",
    "feb0::1",
    // IPv4-mapped
    "::ffff:127.0.0.1",
    "::ffff:192.168.1.1",
    "::ffff:169.254.169.254",
  ])("blocks %s", (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });
});

describe("isBlockedIp — allowed public addresses", () => {
  it.each([
    "93.184.216.34", // example.com
    "8.8.8.8",
    "1.1.1.1",
    "104.16.0.0",
    "172.15.255.255", // just outside 172.16/12
    "172.32.0.0", // just outside 172.16/12 upper
    "192.167.255.255", // just below 192.168
    "198.17.255.255", // just below 198.18/15
    "198.20.0.0", // just above 198.18/15
    "223.255.255.255", // just below multicast
    "2606:2800:220:1:248:1893:25c8:1946", // example.com IPv6
  ])("allows %s", (ip) => {
    expect(isBlockedIp(ip)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// assertPublicHttpHost
// ---------------------------------------------------------------------------

interface LookupEntry {
  address: string;
  family: number;
}

function makeLookup(
  map: Record<string, LookupEntry[]>
): (
  host: string,
  opts: { all: true; verbatim: true }
) => Promise<LookupEntry[]> {
  return async (host) => {
    const entries = map[host];
    if (!entries) {
      throw new Error(`NXDOMAIN: ${host}`);
    }
    return entries;
  };
}

describe("assertPublicHttpHost", () => {
  it("rejects non-http(s) protocol", async () => {
    await expect(
      assertPublicHttpHost("ftp://example.com/", makeLookup({}))
    ).rejects.toThrow("Only http and https");
  });

  it("rejects invalid URL", async () => {
    await expect(
      assertPublicHttpHost("not-a-url", makeLookup({}))
    ).rejects.toThrow("Invalid URL");
  });

  it("rejects localhost without DNS", async () => {
    await expect(
      assertPublicHttpHost("http://localhost/", makeLookup({}))
    ).rejects.toThrow("not allowed");
  });

  it("rejects metadata.google.internal without DNS", async () => {
    await expect(
      assertPublicHttpHost("http://metadata.google.internal/", makeLookup({}))
    ).rejects.toThrow("not allowed");
  });

  it("rejects hostname that resolves to private IP", async () => {
    const lookup = makeLookup({
      "internal.example.com": [{ address: "10.0.0.5", family: 4 }],
    });
    await expect(
      assertPublicHttpHost("http://internal.example.com/", lookup)
    ).rejects.toThrow("blocked IP");
  });

  it("allows hostname that resolves to a public IP", async () => {
    const lookup = makeLookup({
      "example.com": [{ address: "93.184.216.34", family: 4 }],
    });
    const result = await assertPublicHttpHost("http://example.com/", lookup);
    expect(result.addresses).toEqual(["93.184.216.34"]);
    expect(result.url.hostname).toBe("example.com");
  });

  it("rejects when any address in a mixed set is private", async () => {
    const lookup = makeLookup({
      "mixed.example.com": [
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.1", family: 4 },
      ],
    });
    await expect(
      assertPublicHttpHost("http://mixed.example.com/", lookup)
    ).rejects.toThrow("blocked IP");
  });

  it("rejects decimal IP 2130706433 (127.0.0.1)", async () => {
    // Node normalizes http://2130706433/ hostname to 127.0.0.1
    // Either isBlockedHostname catches 127.x or isBlockedIp catches the parsed IP
    await expect(
      assertPublicHttpHost("http://2130706433/", makeLookup({}))
    ).rejects.toThrow();
  });

  it("rejects IPv4 literal 127.0.0.1 directly", async () => {
    await expect(
      assertPublicHttpHost("http://127.0.0.1/", makeLookup({}))
    ).rejects.toThrow("not allowed");
  });

  it("rejects IPv6 literal ::1", async () => {
    await expect(
      assertPublicHttpHost("http://[::1]/", makeLookup({}))
    ).rejects.toThrow("not allowed");
  });

  it("rejects IPv6 literal fc00::1", async () => {
    await expect(
      assertPublicHttpHost("http://[fc00::1]/", makeLookup({}))
    ).rejects.toThrow("not allowed");
  });

  it("allows public IPv6 literal", async () => {
    const result = await assertPublicHttpHost(
      "http://[2606:2800:220:1:248:1893:25c8:1946]/",
      makeLookup({})
    );
    expect(result.addresses).toHaveLength(1);
  });

  it("rejects DNS resolution failure", async () => {
    const lookup = makeLookup({});
    await expect(
      assertPublicHttpHost("http://nxdomain.example.com/", lookup)
    ).rejects.toThrow("DNS resolution failed");
  });
});
