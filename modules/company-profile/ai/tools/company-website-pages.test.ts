import { describe, expect, it } from "vitest";
import {
  buildCompanyWebsitePagesTool,
  isPublicWebsiteUrl,
} from "./company-website-pages.js";

describe("isPublicWebsiteUrl", () => {
  it("accepts real public websites", () => {
    expect(isPublicWebsiteUrl("https://example.com")).toBe(true);
    expect(isPublicWebsiteUrl("example.com")).toBe(true);
  });

  it("rejects localhost and local development hosts", () => {
    expect(isPublicWebsiteUrl("http://localhost:5173")).toBe(false);
    expect(isPublicWebsiteUrl("https://engenty.localhost")).toBe(false);
    expect(isPublicWebsiteUrl("http://127.0.0.1:3000")).toBe(false);
    expect(isPublicWebsiteUrl("http://192.168.1.10")).toBe(false);
  });
});

describe("buildCompanyWebsitePagesTool", () => {
  it("returns an error for non-public website URLs", async () => {
    const tool = buildCompanyWebsitePagesTool();
    const result = await tool.execute?.({
      website_url: "https://engenty.localhost",
    });

    expect(result).toEqual({
      ok: false,
      error:
        "Invalid or non-public website URL. Use a public company website, not localhost or .local addresses.",
    });
  });
});
