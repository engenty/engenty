/** @vitest-environment happy-dom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  McpAppToolCallCard,
  readMcpAppMeta,
} from "./mcp-app-tool-call-card.js";
import { resolveRoutedToolCallCard } from "./tool-call-ui-defaults.js";

const output = {
  _meta: {
    engenty: {
      mcp_app: {
        html: "<!doctype html><html><body>Events</body></html>",
        resource_uri: "ui://events/demo.html",
        server_id: "demo",
        server_label: "Demo",
        server_url: "https://example.com/mcp",
        tool_name: "hello_world_events",
      },
    },
  },
};

describe("McpAppToolCallCard", () => {
  it("detects MCP App metadata", () => {
    expect(readMcpAppMeta(output)).toMatchObject({
      resource_uri: "ui://events/demo.html",
      server_id: "demo",
      tool_name: "hello_world_events",
    });
  });

  it("is selected by the tool-call registry", () => {
    const Card = resolveRoutedToolCallCard({
      toolName: "mcp.chatbot.demo.hello_world_events",
      output,
    });

    expect(Card).toBe(McpAppToolCallCard);
  });

  it("renders sandboxed MCP App iframe HTML", () => {
    render(
      <McpAppToolCallCard
        output={output}
        state="completed"
        toolName="mcp.chatbot.demo.hello_world_events"
      />
    );

    const iframe = screen.getByTitle("Demo interactive widget");
    expect(iframe.getAttribute("sandbox")).toBeTruthy();
    // The host injects its CSP meta ahead of the widget markup.
    const srcDoc = iframe.getAttribute("srcdoc") ?? "";
    expect(srcDoc).toContain('http-equiv="Content-Security-Policy"');
    expect(srcDoc).toContain("default-src 'none'");
    expect(srcDoc).toContain("<!doctype html><html><body>Events</body></html>");
    expect(screen.queryByText("Open server")).toBeNull();
  });
});
