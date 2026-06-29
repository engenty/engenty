import { describe, expect, it } from "vitest";
import {
  basenamePath,
  buildToolCallDetailSections,
  formatLineRange,
} from "./tool-call-presentation.js";

describe("tool-call-presentation", () => {
  it("extracts basename from workspace paths", () => {
    expect(basenamePath("/sandbox/README.md")).toBe("README.md");
    expect(basenamePath("src/agents/assemble-dynamic-agent.ts")).toBe(
      "assemble-dynamic-agent.ts"
    );
  });

  it("formats line ranges from input", () => {
    expect(formatLineRange({ startLine: 1, endLine: 176 })).toBe("L1-176");
  });

  it("builds readable detail sections for file reads", () => {
    const sections = buildToolCallDetailSections({
      toolName: "mastra_workspace_read_file",
      input: { path: "/sandbox/README.md" },
      output: "README.md (5856 bytes)\n 1-># Engenty Copilot\n 2->More content",
      state: "completed",
    });

    expect(sections.fields).toEqual([
      { label: "Path", value: "/sandbox/README.md", mono: true },
    ]);
    expect(sections.outputText).toContain("# Engenty Copilot");
    expect(sections.errorMessage).toBeUndefined();
  });

  it("surfaces command output without raw JSON", () => {
    const sections = buildToolCallDetailSections({
      toolName: "mastra_workspace_execute_command",
      input: { command: "tree -L 1 /sandbox" },
      output: {
        command: "tree -L 1 /sandbox",
        exitCode: 0,
        stderr: "",
        stdout: "/sandbox\n  notes.md",
      },
      state: "completed",
    });

    expect(sections.fields).toEqual([
      { label: "Command", value: "tree -L 1 /sandbox", mono: true },
    ]);
    expect(sections.outputText).toContain("/sandbox");
  });

  it("shows error text for failed tool calls", () => {
    const sections = buildToolCallDetailSections({
      toolName: "mastra_workspace_read_file",
      input: { path: "/sandbox/missing.md" },
      errorText: "ENOENT: no such file",
      state: "error",
    });

    expect(sections.errorMessage).toBe("ENOENT: no such file");
    expect(sections.outputText).toBeUndefined();
  });
});
