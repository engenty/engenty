import { describe, expect, it } from "vitest";
import { mcpLoginHref, redirectHost } from "./mcp-consent";

describe("MCP consent helpers", () => {
  it("preserves the OAuth return path and contextual client name", () => {
    const href = mcpLoginHref("auth id", "Cursor");
    const url = new URL(href, "https://engenty.localhost");
    expect(url.pathname).toBe("/auth/login");
    expect(url.searchParams.get("flow")).toBe("mcp");
    expect(url.searchParams.get("continue")).toBe("Cursor");
    expect(url.searchParams.get("redirect")).toBe(
      "/oauth/consent?authorization_id=auth%20id"
    );
  });

  it("shows only the registered redirect host", () => {
    expect(redirectHost("https://cursor.com/oauth/callback")).toBe(
      "cursor.com"
    );
  });
});
