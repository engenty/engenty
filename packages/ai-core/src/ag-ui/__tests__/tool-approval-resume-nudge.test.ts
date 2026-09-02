import { describe, expect, it } from "vitest";
import { isToolApprovalResumeNudgeText } from "../tool-approval-resume-nudge.js";

describe("isToolApprovalResumeNudgeText", () => {
  it("matches a single-op approval nudge", () => {
    expect(
      isToolApprovalResumeNudgeText(
        'Approved: you may now run "inbox_thread_get". Proceed with the operation.'
      )
    ).toBe(true);
  });

  it("matches a bulk-op denial nudge", () => {
    expect(
      isToolApprovalResumeNudgeText(
        'The user denied "tasks_create", "tasks_update". Do not run it; continue without that operation.'
      )
    ).toBe(true);
  });

  it("ignores a real user message", () => {
    expect(isToolApprovalResumeNudgeText("Please get that inbox thread.")).toBe(
      false
    );
    expect(
      isToolApprovalResumeNudgeText("Approved, go ahead with the export.")
    ).toBe(false);
  });
});
