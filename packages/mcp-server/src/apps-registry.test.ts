import { describe, expect, it } from "vitest";
import {
  clearMcpAppTemplatesForTests,
  getMcpAppTemplate,
  MCP_APP_TEMPLATE_MAX_BYTES,
  registerMcpAppTemplate,
} from "./apps-registry.js";

describe("MCP Apps template registry", () => {
  it("rejects non-ui URIs and oversized templates", () => {
    expect(() =>
      registerMcpAppTemplate({ html: "<p>x</p>", uri: "https://example/x" })
    ).toThrow(/ui:\/\//);
    expect(() =>
      registerMcpAppTemplate({
        html: "x".repeat(MCP_APP_TEMPLATE_MAX_BYTES + 1),
        uri: "ui://engenty/too-big.html",
      })
    ).toThrow(/exceeds/);
  });

  it("stores and unregisters a template", () => {
    clearMcpAppTemplatesForTests();
    const unregister = registerMcpAppTemplate({
      html: "<p>ok</p>",
      uri: "ui://engenty/ok.html",
    });
    expect(getMcpAppTemplate("ui://engenty/ok.html")?.html).toBe("<p>ok</p>");
    expect(getMcpAppTemplate("ui://engenty/ok.html")?.integrity).toMatch(
      /^[a-f0-9]{64}$/
    );
    unregister();
    expect(getMcpAppTemplate("ui://engenty/ok.html")).toBeUndefined();
  });
});
