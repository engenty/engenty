import { describe, expect, it } from "vitest";

import { parseComputerEgressHost } from "./computer-network-tier.js";

// What a Space admin types into "Allowed hosts" becomes a proxy rule. Ways it
// can fail: a URL, a port or a path slips in and never matches; a bare `*` or
// a TLD opens far more than one API; case or a trailing dot makes the same
// host two entries.
describe("parseComputerEgressHost", () => {
  it("keeps a host or a subdomain wildcard, normalised", () => {
    expect(parseComputerEgressHost(" API.Acme.com. ")).toBe("api.acme.com");
    expect(parseComputerEgressHost("*.acme.com")).toBe("*.acme.com");
  });

  it("refuses anything that is not one host", () => {
    for (const raw of [
      "https://api.acme.com",
      "api.acme.com:443",
      "api.acme.com/v1",
      "*",
      "*.com",
      "com",
      "api.*.com",
      "10.0.0.1",
      "",
    ]) {
      expect(parseComputerEgressHost(raw)).toBeNull();
    }
  });
});
