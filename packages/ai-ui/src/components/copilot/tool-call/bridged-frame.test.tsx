/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  BridgedFrame,
  buildWidgetCsp,
  injectCspMeta,
} from "./bridged-frame.js";

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

  it("reads a bare host as its https origin", () => {
    expect(buildWidgetCsp({ connectDomains: ["api.example.com"] })).toContain(
      "connect-src https://api.example.com;"
    );
  });

  it("ignores declarations that would widen the policy", () => {
    const csp = buildWidgetCsp({
      connectDomains: [
        "*",
        "https:",
        "https://*.example.com",
        "http://api.example.com",
        "https://api.example.com/v1",
      ],
      resourceDomains: ["*", "data:"],
    });
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("img-src data: blob:;");
  });

  it("ignores declarations that would break out of the policy", () => {
    const page = injectCspMeta(
      "<head></head>",
      buildWidgetCsp({
        connectDomains: [
          'api.example.com" http-equiv="refresh',
          "https://api.example.com; frame-src *",
        ],
      })
    );
    expect(page).toContain("connect-src 'none'");
    expect(page).toContain("frame-src 'none'");
    expect(page).not.toContain("frame-src *");
    expect(page).not.toContain('http-equiv="refresh');
  });

  it("keeps resource hosts out of connect-src", () => {
    const csp = buildWidgetCsp({
      resourceDomains: ["https://cdn.example.com"],
    });
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

  it("keeps the policy inside its attribute", () => {
    const out = injectCspMeta(
      "<head></head>",
      "default-src 'none'\" onload=\"x()"
    );
    expect(out).not.toContain('onload="x()"');
  });

  it("prepends the policy when the document has no head", () => {
    const out = injectCspMeta("<p>bare fragment</p>", "default-src 'none'");
    expect(out.startsWith('<meta http-equiv="Content-Security-Policy"')).toBe(
      true
    );
  });
});

describe("BridgedFrame", () => {
  afterEach(() => {
    cleanup();
  });

  it("isolates the guest: opaque origin and CSP ahead of its markup", () => {
    render(
      <BridgedFrame
        callTool={async () => ({})}
        frameKey="guest"
        html="<html><head><script>guest()</script></head><body></body></html>"
        title="Guest app"
      />
    );

    const frame = screen.getByTitle("Guest app");
    const sandbox = (frame.getAttribute("sandbox") ?? "").split(/\s+/);
    expect(sandbox).toContain("allow-scripts");
    expect(sandbox).not.toContain("allow-same-origin");

    const srcDoc = frame.getAttribute("srcdoc") ?? "";
    const cspIndex = srcDoc.indexOf(
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\''
    );
    expect(cspIndex).toBeGreaterThan(-1);
    expect(cspIndex).toBeLessThan(srcDoc.indexOf("guest()"));
  });
});
