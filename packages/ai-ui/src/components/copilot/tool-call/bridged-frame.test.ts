import { describe, expect, it } from "vitest";
import { buildWidgetCsp, injectCspMeta } from "./bridged-frame.js";

/**
 * The CSP is the guest's outer boundary: the frame has an opaque origin, so a
 * mistake here is the difference between "an App can talk to engenty through
 * the proxy" and "an App can talk to anywhere". These lock the deny-by-default
 * shape in place.
 */
describe("buildWidgetCsp", () => {
  it("denies everything by default", () => {
    const csp = buildWidgetCsp();
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("frame-src 'none'");
  });

  it("opens connect-src only for declared hosts", () => {
    const csp = buildWidgetCsp({ connectDomains: ["https://api.example.com"] });
    expect(csp).toContain("connect-src https://api.example.com");
    expect(csp).not.toContain("connect-src 'none'");
    // Widening connect must not widen anything else.
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-src 'none'");
  });

  it("keeps resource hosts out of connect-src", () => {
    const csp = buildWidgetCsp({ resourceDomains: ["https://cdn.example.com"] });
    expect(csp).toContain("img-src data: blob: https://cdn.example.com");
    expect(csp).toContain("connect-src 'none'");
  });
});

describe("injectCspMeta", () => {
  it("inserts the policy immediately after <head> so it precedes guest markup", () => {
    const out = injectCspMeta(
      "<html><head><script>evil()</script></head><body></body></html>",
      "default-src 'none'"
    );
    const metaIndex = out.indexOf("Content-Security-Policy");
    const scriptIndex = out.indexOf("evil()");
    expect(metaIndex).toBeGreaterThan(-1);
    expect(metaIndex).toBeLessThan(scriptIndex);
  });

  it("prepends the policy when the document has no head", () => {
    const out = injectCspMeta("<p>bare fragment</p>", "default-src 'none'");
    expect(out.startsWith("<meta http-equiv=\"Content-Security-Policy\"")).toBe(
      true
    );
  });
});
