import { describe, expect, it } from "vitest";
import {
  isMcpAudienceAllowed,
  mcpAudience,
  mcpResourceUrl,
} from "./audience.js";

describe("MCP audience", () => {
  it("never accepts the generic engenty audience alone", () => {
    expect(isMcpAudienceAllowed(["engenty"], "engenty-mcp")).toBe(false);
    expect(isMcpAudienceAllowed(["engenty-mcp"], "engenty-mcp")).toBe(true);
    expect(
      isMcpAudienceAllowed(
        ["http://127.0.0.1:8787/mcp"],
        "http://127.0.0.1:8787/mcp"
      )
    ).toBe(true);
  });

  it("derives the resource URL from config", () => {
    expect(
      mcpResourceUrl({ mcpResourceUrl: "https://engenty.localhost/mcp/" })
    ).toBe("https://engenty.localhost/mcp");
    expect(mcpAudience({ mcpAudience: "engenty-mcp" })).toBe("engenty-mcp");
  });
});
