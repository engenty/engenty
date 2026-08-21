import { describe, expect, it } from "vitest";
import { parseTaskBlocked } from "../task-blocked.js";

describe("parseTaskBlocked", () => {
  it("reads a trailing marker and strips it from the report", () => {
    const parsed = parseTaskBlocked(
      "Logged 3 entries for Monday and Tuesday.\nTASK_BLOCKED: which project should Wednesday's 4h go to — ask Matthias"
    );
    expect(parsed).toEqual({
      cleanedText: "Logged 3 entries for Monday and Tuesday.",
      question: "which project should Wednesday's 4h go to — ask Matthias",
    });
  });

  it("reads a leading marker", () => {
    const parsed = parseTaskBlocked(
      "TASK_BLOCKED: no invoice template is configured\nEverything else is ready."
    );
    expect(parsed?.question).toBe("no invoice template is configured");
    expect(parsed?.cleanedText).toBe("Everything else is ready.");
  });

  it("ignores an ordinary report", () => {
    expect(parseTaskBlocked("Created the report and attached it.")).toBeNull();
    expect(parseTaskBlocked("")).toBeNull();
    expect(parseTaskBlocked(null)).toBeNull();
  });

  it("ignores a bare marker with no question", () => {
    // "Blocked, reason unspecified" is worse than a plain report: the task
    // stops and nobody can act on it.
    expect(parseTaskBlocked("TASK_BLOCKED")).toBeNull();
    expect(parseTaskBlocked("Did some work.\nTASK_BLOCKED:")).toBeNull();
  });

  it("leaves a mid-text mention alone", () => {
    const text =
      "The runbook says to answer TASK_BLOCKED: questions within a day.";
    expect(parseTaskBlocked(text)).toBeNull();
  });
});
