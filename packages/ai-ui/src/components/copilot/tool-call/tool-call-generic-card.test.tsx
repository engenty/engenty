/**
 * @vitest-environment happy-dom
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ToolCallGenericCard } from "./tool-call-generic-card.js";

describe("ToolCallGenericCard", () => {
  it("renders a muted overview line with file name and structured details", () => {
    render(
      <ToolCallGenericCard
        input={{ path: "/sandbox/README.md", startLine: 1, endLine: 40 }}
        output="README.md (120 bytes)\n 1-># Title"
        state="completed"
        toolName="mastra_workspace_read_file"
      />
    );

    expect(screen.getByText("Read README.md")).toBeTruthy();
    expect(screen.getByText("L1-40")).toBeTruthy();
    expect(screen.queryByText("Metadata")).toBeNull();
    expect(screen.queryByText('"path"')).toBeNull();
  });

  it("prefixes failed tool rows", () => {
    render(
      <ToolCallGenericCard
        errorText="Permission denied"
        input={{ path: "/sandbox/README.md" }}
        state="error"
        toolName="mastra_workspace_read_file"
      />
    );

    expect(screen.getByText(/Failed · Read README\.md/)).toBeTruthy();
  });
});
