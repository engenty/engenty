import { describe, expect, it } from "vitest";
import {
  buildToolApprovalArtifact,
  buildToolApprovalArtifactId,
  isToolApprovalArtifactId,
  parseToolApprovalOperationId,
  resolveToolApprovalDecision,
  TOOL_APPROVAL_CHOICE_APPROVE_ALWAYS,
  TOOL_APPROVAL_CHOICE_APPROVE_ONCE,
  TOOL_APPROVAL_CHOICE_DENY,
} from "../../ai/tools/engenty-tools/lib/tool-approval.js";
import {
  readToolApprovalGrants,
  withToolApprovalGrant,
} from "../ai/sessions/tool-approval-grants.js";
import { isDecisionArtifactPayload } from "../ai/sessions/transcript.js";

describe("resolveToolApprovalDecision", () => {
  it("allows read-only / low-risk operations without approval", () => {
    expect(
      resolveToolApprovalDecision({
        operationId: "contacts_contact_search",
        requiresApproval: false,
        riskLevel: "low",
      })
    ).toBe("allow");
    expect(
      resolveToolApprovalDecision({
        operationId: "contacts_contact_search",
        requiresApproval: false,
        riskLevel: "medium",
      })
    ).toBe("allow");
  });

  it("gates when the contract requires approval", () => {
    expect(
      resolveToolApprovalDecision({
        operationId: "contacts_contact_delete",
        requiresApproval: true,
        riskLevel: "low",
      })
    ).toBe("require_approval");
  });

  it("defers risk-only operations to core (pre-gate stays conservative)", () => {
    // high/critical risk WITHOUT an explicit requiresApproval flag is NOT
    // pre-gated — core's authoritative 202 handles it at invoke time.
    for (const riskLevel of ["high", "critical"] as const) {
      expect(
        resolveToolApprovalDecision({
          operationId: "billing_charge",
          requiresApproval: false,
          riskLevel,
        })
      ).toBe("allow");
    }
  });

  it("bypasses the gate when the operation is already granted for the chat", () => {
    expect(
      resolveToolApprovalDecision({
        grants: ["contacts_contact_delete"],
        operationId: "contacts_contact_delete",
        requiresApproval: true,
        riskLevel: "critical",
      })
    ).toBe("allow");
    // a grant for a DIFFERENT operation does not leak
    expect(
      resolveToolApprovalDecision({
        grants: ["contacts_contact_search"],
        operationId: "contacts_contact_delete",
        requiresApproval: true,
        riskLevel: "high",
      })
    ).toBe("require_approval");
  });
});

describe("tool-approval artifact", () => {
  it("builds a decision-shaped artifact the run loop already detects", () => {
    const artifact = buildToolApprovalArtifact({
      operationId: "contacts_contact_delete",
      requiresApproval: true,
      riskLevel: "critical",
      title: "Delete contact",
    });
    expect(isDecisionArtifactPayload(artifact)).toBe(true);
    expect(artifact.choices.map((c) => c.id)).toEqual([
      TOOL_APPROVAL_CHOICE_APPROVE_ONCE,
      TOOL_APPROVAL_CHOICE_APPROVE_ALWAYS,
      TOOL_APPROVAL_CHOICE_DENY,
    ]);
  });

  it("round-trips the operation id through the artifact id", () => {
    const id = buildToolApprovalArtifactId("module.contacts/contact.delete");
    expect(isToolApprovalArtifactId(id)).toBe(true);
    expect(parseToolApprovalOperationId(id)).toBe(
      "module.contacts/contact.delete"
    );
    expect(parseToolApprovalOperationId("decision-123")).toBeNull();
    expect(parseToolApprovalOperationId(undefined)).toBeNull();
  });
});

describe("tool-approval grants metadata", () => {
  it("reads, adds, and de-dupes thread grants", () => {
    expect(readToolApprovalGrants(undefined)).toEqual([]);
    expect(readToolApprovalGrants({ other: 1 })).toEqual([]);
    const m1 = withToolApprovalGrant(null, "contacts_contact_delete");
    expect(readToolApprovalGrants(m1)).toEqual(["contacts_contact_delete"]);
    const m2 = withToolApprovalGrant(m1, "contacts_contact_delete");
    expect(readToolApprovalGrants(m2)).toEqual(["contacts_contact_delete"]);
    const m3 = withToolApprovalGrant(m2, "billing_charge");
    expect(readToolApprovalGrants(m3)).toEqual([
      "contacts_contact_delete",
      "billing_charge",
    ]);
  });

  it("preserves unrelated metadata keys", () => {
    const next = withToolApprovalGrant({ keep: "me" }, "op");
    expect(next.keep).toBe("me");
  });
});
