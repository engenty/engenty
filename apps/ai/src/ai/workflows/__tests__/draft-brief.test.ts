// The brief IS the repair contract — pin where the user's instruction lands:
// after the issue list (so it reads as guidance about those issues) and before
// the output contract (which must stay last; it's what keeps replies JSON).
import { describe, expect, it } from "vitest";
import { buildBrief, WIZARD_BRIEF } from "../draft-from-description.js";

const ISSUES = [
  {
    code: "unknown-tool" as const,
    entryId: "send",
    message: "toolId 'nope' is not a registered tool",
    path: "graph[1]",
  },
];

describe("buildBrief", () => {
  it("places the instruction after the issues and before the output contract", () => {
    const brief = buildBrief({
      description: "send things",
      instruction: "use the invoices module",
      issues: ISSUES,
      name: "Test",
      previous: "[]",
    });
    const issuePos = brief.indexOf("unknown-tool");
    const instructionPos = brief.indexOf("use the invoices module");
    const contractPos = brief.indexOf("Respond with ONLY a JSON object");
    expect(issuePos).toBeGreaterThan(-1);
    expect(instructionPos).toBeGreaterThan(issuePos);
    expect(contractPos).toBeGreaterThan(instructionPos);
  });

  it("adds the wizard paragraph before the graph rules, only for a wizard", () => {
    const wizard = buildBrief({
      description: "make a meeting protocol from bullet points",
      name: "Meeting-Protokoll",
      surface: "wizard",
    });
    const paragraphPos = wizard.indexOf(WIZARD_BRIEF);
    const rulesPos = wizard.indexOf(
      "You are writing a Mastra dynamic workflow graph"
    );
    expect(paragraphPos).toBeGreaterThan(-1);
    expect(rulesPos).toBeGreaterThan(paragraphPos);
    const paragraph = WIZARD_BRIEF.replace(/\s+/g, " ");
    expect(paragraph).toContain("Every approval_gate is a page");
    expect(paragraph).toContain("never end without a gate");

    const chat = buildBrief({
      description: "make a meeting protocol from bullet points",
      name: "Meeting-Protokoll",
    });
    expect(chat).not.toContain(WIZARD_BRIEF);
  });

  it("carries the wizard paragraph into a repair round too", () => {
    const brief = buildBrief({
      description: "make a meeting protocol",
      issues: [
        {
          code: "wizard-without-step" as never,
          message: "a wizard needs at least one approval_gate",
          path: "graph",
        },
      ],
      name: "Meeting-Protokoll",
      previous: "[]",
      surface: "wizard",
    });
    expect(brief).toContain(WIZARD_BRIEF);
    expect(brief.indexOf(WIZARD_BRIEF)).toBeLessThan(
      brief.indexOf("wizard-without-step")
    );
  });

  it("ignores the instruction outside a repair (no issues)", () => {
    const brief = buildBrief({
      description: "send things",
      instruction: "use the invoices module",
      name: "Test",
    });
    expect(brief).not.toContain("use the invoices module");
  });
});
