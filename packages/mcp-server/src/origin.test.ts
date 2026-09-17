import { describe, expect, it } from "vitest";
import { isMcpOriginAllowed } from "./origin.js";

describe("MCP origin validation", () => {
  it("allows missing Origin (non-browser clients)", () => {
    expect(isMcpOriginAllowed(null, ["engenty.localhost"])).toBe(true);
  });

  it("rejects an origin that is not on the allowlist", () => {
    expect(
      isMcpOriginAllowed("https://evil.example", ["engenty.localhost"])
    ).toBe(false);
  });

  it("allows a listed hostname regardless of port", () => {
    expect(
      isMcpOriginAllowed("https://engenty.localhost:443", ["engenty.localhost"])
    ).toBe(true);
  });
});
