import { describe, expect, it } from "vitest";
import {
  isDocsGatewayPath,
  isManageGatewayPath,
  manageCanonicalRedirect,
  resolveGatewayTarget,
} from "./gateway-paths.js";

describe("gateway-paths", () => {
  it("resolveGatewayTarget routes native API paths to Hono", () => {
    expect(resolveGatewayTarget("/api/users")).toBeNull();
    expect(resolveGatewayTarget("/api/docs")).toBeNull();
    expect(resolveGatewayTarget("/api/openapi.json")).toBeNull();
    expect(resolveGatewayTarget("/gateway/foo")).toBeNull();
    expect(resolveGatewayTarget("/mcp")).toBeNull();
    expect(resolveGatewayTarget("/mcp/")).toBeNull();
  });

  it("isDocsGatewayPath matches Fumadocs routes", () => {
    expect(isDocsGatewayPath("/docs")).toBe(true);
    expect(isDocsGatewayPath("/docs/dev/quick-start")).toBe(true);
    expect(isDocsGatewayPath("/_next/static/chunk.js")).toBe(true);
    expect(isDocsGatewayPath("/__nextjs_error")).toBe(true);
    expect(isDocsGatewayPath("/api/search")).toBe(true);
    expect(isDocsGatewayPath("/api/users")).toBe(false);
  });

  it("the docs Changelog page routes to docs, not the SPA", () => {
    expect(resolveGatewayTarget("/changelog")).toBe("docs");
    // Only the exact path — nothing else may be taken from the UI.
    expect(resolveGatewayTarget("/changelog/x")).toBe("ui");
    expect(resolveGatewayTarget("/changelogs")).toBe("ui");
  });

  it("root favicons fall through to the UI app, not docs", () => {
    // Regression: /favicon.svg + /favicon.ico were diverted to docs for
    // every gateway host, 404ing on the main SPA (docs serves them only
    // under its own routing). They must be served by the UI static root.
    expect(isDocsGatewayPath("/favicon.ico")).toBe(false);
    expect(isDocsGatewayPath("/favicon.svg")).toBe(false);
    expect(resolveGatewayTarget("/favicon.ico")).toBe("ui");
    expect(resolveGatewayTarget("/favicon.svg")).toBe("ui");
  });

  it("resolveGatewayTarget routes docs before core /api", () => {
    expect(resolveGatewayTarget("/docs")).toBe("docs");
    expect(resolveGatewayTarget("/api/search")).toBe("docs");
    expect(resolveGatewayTarget("/api/users")).toBeNull();
  });

  it("resolveGatewayTarget routes AI and Studio paths", () => {
    expect(resolveGatewayTarget("/ai")).toBe("ai");
    expect(resolveGatewayTarget("/ai/v1/sessions")).toBe("ai");
    expect(resolveGatewayTarget("/studio")).toBe("studio");
    expect(resolveGatewayTarget("/studio/agents")).toBe("studio");
  });

  it("isManageGatewayPath matches manage app routes", () => {
    expect(isManageGatewayPath("/manage")).toBe(true);
    expect(isManageGatewayPath("/manage/tenants")).toBe(true);
    expect(isManageGatewayPath("/management")).toBe(false);
  });

  it("resolveGatewayTarget routes Manage paths", () => {
    expect(resolveGatewayTarget("/manage")).toBe("manage");
    expect(resolveGatewayTarget("/manage/tenants")).toBe("manage");
  });

  it("resolveGatewayTarget routes UI paths", () => {
    expect(resolveGatewayTarget("/")).toBe("ui");
    expect(resolveGatewayTarget("/mdl/engenty-copilot/chat/new")).toBe("ui");
  });

  it("manageCanonicalRedirect canonicalizes only bare /manage, preserving query", () => {
    expect(manageCanonicalRedirect("/manage", "")).toBe("/manage/");
    expect(manageCanonicalRedirect("/manage", "?tab=x")).toBe("/manage/?tab=x");
    // Already-canonical and deeper paths must not redirect (would loop).
    expect(manageCanonicalRedirect("/manage/", "")).toBeNull();
    expect(manageCanonicalRedirect("/manage/tenants", "")).toBeNull();
  });
});
