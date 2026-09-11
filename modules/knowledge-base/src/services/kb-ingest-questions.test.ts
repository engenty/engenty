import { describe, expect, it } from "vitest";
import { buildQuestionsSection } from "./kb-ingest-questions.js";

describe("buildQuestionsSection", () => {
  it("links each citation back to the source", () => {
    const section = buildQuestionsSection(
      [{ answer: "34 metres.", citation: "§ 75", question: "How high?" }],
      "Questions answered",
      "https://example.com/law"
    );
    expect(section).toContain("## Questions answered");
    expect(section).toContain("### How high?");
    expect(section).toContain("[§ 75](https://example.com/law)");
  });

  it("keeps the locator readable when there is no URL to link to", () => {
    const section = buildQuestionsSection(
      [{ answer: "34 metres.", citation: "§ 75", question: "How high?" }],
      "Questions answered",
      null
    );
    expect(section).toContain("_§ 75_");
    expect(section).not.toContain("](");
  });

  it("omits the citation line when the source has no locator", () => {
    const section = buildQuestionsSection(
      [{ answer: "34 metres.", citation: null, question: "How high?" }],
      "Questions answered",
      "https://example.com/law"
    );
    expect(section).toBe(
      "## Questions answered\n\n### How high?\n\n34 metres."
    );
  });

  it("returns nothing when the model found no questions", () => {
    expect(buildQuestionsSection([], "Questions answered", null)).toBe("");
  });
});
