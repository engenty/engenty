import { describe, expect, it } from "vitest";
import { promptWorkflowDefinition } from "../prompt-workflow.js";
import { validateGraphAction } from "../validate-graph.js";

describe("prompt workflow definition", () => {
  it("validates against the primitive index without a capability in sight", () => {
    const def = promptWorkflowDefinition({
      agentId: "chief-of-staff",
      prompt: "Summarize what needs me today.",
    });
    const issues = validateGraphAction(def, {
      capabilityForOperation: () => undefined,
      holdsCapability: () => false,
    });
    expect(issues).toEqual([]);
  });
});
