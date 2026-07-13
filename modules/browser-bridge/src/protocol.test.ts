import { describe, expect, it } from "vitest";
import {
  clickInputSchema,
  fillInputSchema,
  isOriginAllowed,
  navigateInputSchema,
  normalizeAllowedOrigin,
  observeInputSchema,
  UNTRUSTED_CONTENT_PREFIX,
  UNTRUSTED_CONTENT_SUFFIX,
  wrapUntrustedContent,
} from "./protocol.js";

describe("normalizeAllowedOrigin", () => {
  it("normalizes plain origins", () => {
    expect(normalizeAllowedOrigin("https://App.Example.com/")).toBe(
      "https://app.example.com"
    );
    expect(normalizeAllowedOrigin("https://example.com:8443")).toBe(
      "https://example.com:8443"
    );
    expect(normalizeAllowedOrigin("http://localhost:5173")).toBe(
      "http://localhost:5173"
    );
  });

  it("preserves wildcard-subdomain entries", () => {
    expect(normalizeAllowedOrigin("https://*.example.com")).toBe(
      "https://*.example.com"
    );
  });

  it("rejects paths, non-http schemes, and garbage", () => {
    expect(normalizeAllowedOrigin("https://example.com/app")).toBeNull();
    expect(normalizeAllowedOrigin("ftp://example.com")).toBeNull();
    expect(normalizeAllowedOrigin("chrome://settings")).toBeNull();
    expect(normalizeAllowedOrigin("not a url")).toBeNull();
    expect(normalizeAllowedOrigin("")).toBeNull();
  });
});

describe("isOriginAllowed", () => {
  const allowlist = [
    "https://app.example.com",
    "https://*.internal.test",
    "http://localhost:5173",
  ];

  it("matches exact origins", () => {
    expect(
      isOriginAllowed("https://app.example.com/deep/path?q=1", allowlist)
    ).toBe(true);
    expect(isOriginAllowed("http://localhost:5173/", allowlist)).toBe(true);
  });

  it("matches wildcard subdomains including the apex", () => {
    expect(isOriginAllowed("https://a.internal.test/x", allowlist)).toBe(true);
    expect(isOriginAllowed("https://a.b.internal.test/", allowlist)).toBe(true);
    expect(isOriginAllowed("https://internal.test/", allowlist)).toBe(true);
  });

  it("denies other origins, schemes, ports, and lookalike hosts", () => {
    expect(isOriginAllowed("https://evil.com/", allowlist)).toBe(false);
    expect(isOriginAllowed("http://app.example.com/", allowlist)).toBe(false);
    expect(isOriginAllowed("https://app.example.com:8443/", allowlist)).toBe(
      false
    );
    expect(isOriginAllowed("https://notinternal.test/", allowlist)).toBe(false);
    expect(isOriginAllowed("https://xinternal.test/", allowlist)).toBe(false);
    expect(isOriginAllowed("file:///etc/passwd", allowlist)).toBe(false);
    expect(isOriginAllowed("chrome://settings", allowlist)).toBe(false);
    expect(isOriginAllowed("not a url", allowlist)).toBe(false);
  });

  it("denies everything on an empty allowlist", () => {
    expect(isOriginAllowed("https://app.example.com/", [])).toBe(false);
  });
});

describe("untrusted content envelope", () => {
  it("wraps text between the markers", () => {
    const wrapped = wrapUntrustedContent("hello");
    expect(wrapped.startsWith(UNTRUSTED_CONTENT_PREFIX)).toBe(true);
    expect(wrapped.endsWith(UNTRUSTED_CONTENT_SUFFIX)).toBe(true);
    expect(wrapped).toContain("hello");
  });
});

describe("action schemas", () => {
  it("navigate requires an absolute url", () => {
    expect(
      navigateInputSchema.safeParse({ url: "https://a.test/x" }).success
    ).toBe(true);
    expect(navigateInputSchema.safeParse({ url: "/relative" }).success).toBe(
      false
    );
    expect(navigateInputSchema.safeParse({}).success).toBe(false);
  });

  it("observe defaults mode to outline and bounds max_chars", () => {
    const parsed = observeInputSchema.parse({});
    expect(parsed.mode).toBe("outline");
    expect(observeInputSchema.safeParse({ max_chars: 10 }).success).toBe(false);
    expect(observeInputSchema.safeParse({ max_chars: 1_000_000 }).success).toBe(
      false
    );
  });

  it("click and fill require a non-negative integer ref", () => {
    expect(clickInputSchema.safeParse({ ref: 3 }).success).toBe(true);
    expect(clickInputSchema.safeParse({ ref: -1 }).success).toBe(false);
    expect(clickInputSchema.safeParse({ ref: 1.5 }).success).toBe(false);
    expect(fillInputSchema.safeParse({ ref: 0, value: "x" }).success).toBe(
      true
    );
    expect(fillInputSchema.safeParse({ value: "x" }).success).toBe(false);
  });
});
