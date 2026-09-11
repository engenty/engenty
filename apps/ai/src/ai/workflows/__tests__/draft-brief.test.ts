// The brief IS the repair contract — pin where the user's instruction lands:
// after the issue list (so it reads as guidance about those issues) and before
// the output contract (which must stay last; it's what keeps replies JSON).
import { describe, expect, it } from "vitest";
import { buildBrief } from "../draft-from-description.js";

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

  it("ignores the instruction outside a repair (no issues)", () => {
    const brief = buildBrief({
      description: "send things",
      instruction: "use the invoices module",
      name: "Test",
    });
    expect(brief).not.toContain("use the invoices module");
  });
});
