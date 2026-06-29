import { describe, expect, it } from "vitest";
import {
  formatSubAgentInputText,
  formatSubAgentOutputText,
  readSubAgentInputTask,
  readSubAgentOutputSummary,
  resolveSubAgentCollapsedPreview,
} from "./sub-agent-run-display.js";

describe("readSubAgentInputTask", () => {
  it("reads task from delegation input", () => {
    expect(readSubAgentInputTask({ task: "List contacts" })).toBe(
      "List contacts"
    );
  });

  it("falls back to prompt and instructions", () => {
    expect(readSubAgentInputTask({ prompt: "Hello" })).toBe("Hello");
    expect(readSubAgentInputTask({ instructions: "Run audit" })).toBe(
      "Run audit"
    );
  });
});

describe("formatSubAgentInputText", () => {
  it("returns task text when present", () => {
    expect(formatSubAgentInputText({ task: "date" })).toBe("date");
  });

  it("stringifies non-task objects", () => {
    expect(formatSubAgentInputText({ foo: "bar" })).toBe(
      '{\n  "foo": "bar"\n}'
    );
  });
});

describe("readSubAgentOutputSummary", () => {
  it("returns the first line of summary", () => {
    expect(
      readSubAgentOutputSummary({
        status: "success",
        summary: "Ran 5 diagnostic commands.\nMore detail here.",
      })
    ).toBe("Ran 5 diagnostic commands.");
  });
});

describe("resolveSubAgentCollapsedPreview", () => {
  it("shows summary when completed successfully", () => {
    expect(
      resolveSubAgentCollapsedPreview({
        input: { task: "Run diagnostics" },
        output: { status: "success", summary: "Ran 5 diagnostic commands." },
        state: "completed",
      })
    ).toEqual({
      text: "Ran 5 diagnostic commands.",
      tone: "default",
    });
  });

  it("shows error text in error tone", () => {
    expect(
      resolveSubAgentCollapsedPreview({
        errorText: "Sandbox unavailable",
        input: { task: "date" },
        output: null,
        state: "error",
      })
    ).toEqual({
      text: "Sandbox unavailable",
      tone: "error",
    });
  });

  it("falls back to input while running", () => {
    expect(
      resolveSubAgentCollapsedPreview({
        input: { task: "List contacts" },
        output: undefined,
        state: "running",
      })
    ).toEqual({
      text: "List contacts",
      tone: "default",
    });
  });
});

describe("formatSubAgentOutputText", () => {
  it("joins summary, text, stderr, and status", () => {
    expect(
      formatSubAgentOutputText({
        status: "success",
        summary: "Done",
        text: "Done",
      })
    ).toBe("Done\n\nstatus: success");
  });

  it("returns plain strings", () => {
    expect(formatSubAgentOutputText("Finished")).toBe("Finished");
  });
});
