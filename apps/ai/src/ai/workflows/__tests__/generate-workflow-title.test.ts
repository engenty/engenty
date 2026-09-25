import { describe, expect, it } from "vitest";
import { parseWorkflowTitleText } from "../generate-workflow-title.js";

describe("parseWorkflowTitleText", () => {
  it("reads the two labelled lines", () => {
    expect(
      parseWorkflowTitleText(
        "TITLE: Weekly invoice reminder\nDESCRIPTION: Emails customers about unpaid invoices every Monday."
      )
    ).toEqual({
      description: "Emails customers about unpaid invoices every Monday.",
      title: "Weekly invoice reminder",
    });
  });

  it("tolerates bold labels, quotes and a fence", () => {
    expect(
      parseWorkflowTitleText(
        '```\n**Title:** "Lead intake"\n**Description:** Files new leads.\n```'
      )
    ).toEqual({ description: "Files new leads.", title: "Lead intake" });
  });

  it("returns null for missing lines", () => {
    expect(parseWorkflowTitleText("Sure! Here you go.")).toEqual({
      description: null,
      title: null,
    });
  });
});
