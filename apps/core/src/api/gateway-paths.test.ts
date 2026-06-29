import { describe, expect, it } from "vitest";
import {
  isDocsGatewayPath,
  isManageGatewayPath,
  resolveGatewayTarget,
} from "./gateway-paths.js";

describe("gateway-paths", () => {
  it("resolveGatewayTarget routes native API paths to Hono", () => {
    expect(resolveGatewayTarget("/api/users")).toBeNull();
    expect(resolveGatewayTarget("/api/docs")).toBeNull();
    expect(resolveGatewayTarget("/api/openapi.json")).toBeNull();
    expect(resolveGatewayTarget("/gateway/foo")).toBeNull();
  });

  it("isDocsGatewayPath matches Fumadocs routes", () => {
    expect(isDocsGatewayPath("/docs")).toBe(true);
    expect(isDocsGatewayPath("/docs/dev/quick-start")).toBe(true);
    expect(isDocsGatewayPath("/_next/static/chunk.js")).toBe(true);
    expect(isDocsGatewayPath("/__nextjs_error")).toBe(true);
    expect(isDocsGatewayPath("/favicon.ico")).toBe(true);
    expect(isDocsGatewayPath("/api/search")).toBe(true);
    expect(isDocsGatewayPath("/api/users")).toBe(false);
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
});
