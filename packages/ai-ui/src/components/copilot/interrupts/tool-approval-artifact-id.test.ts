import { describe, expect, it } from "vitest";
import { parseToolApprovalArtifactId } from "./tool-approval-artifact-id.js";

// The server encoder these cases mirror lives in
// apps/ai/ai/tools/engenty-tools/lib/tool-approval.ts (buildToolApprovalArtifactId).
function buildArtifactId(operationId: string, grantContext?: unknown): string {
  const base = `tool-approval|${encodeURIComponent(operationId)}`;
  return grantContext
    ? `${base}|${encodeURIComponent(JSON.stringify(grantContext))}`
    : base;
}

describe("parseToolApprovalArtifactId", () => {
  it("returns null for artifacts that are not tool approvals", () => {
    expect(parseToolApprovalArtifactId("decision-123")).toBeNull();
    expect(parseToolApprovalArtifactId("")).toBeNull();
    expect(parseToolApprovalArtifactId("tool-approval|")).toBeNull();
  });

  it("reads a single-operation card", () => {
    const parsed = parseToolApprovalArtifactId(
      buildArtifactId("time_tracking_entries_create")
    );
    expect(parsed?.operationId).toBe("time_tracking_entries_create");
    expect(parsed?.operationIds).toEqual(["time_tracking_entries_create"]);
  });

  it("decodes an encoded operation id instead of showing the escape sequences", () => {
    const parsed = parseToolApprovalArtifactId(
      buildArtifactId("module.contacts/contact.delete")
    );
    expect(parsed?.operationId).toBe("module.contacts/contact.delete");
  });

  it("NEVER leaks the grant-context segment into the operation id", () => {
    // The regression: the card printed the whole encoded tail as the operation.
    const artifactId = buildArtifactId("time_tracking_entries_create", {
      operation_ids: ["time_tracking_entries_create"],
    });
    const parsed = parseToolApprovalArtifactId(artifactId);
    expect(parsed?.operationId).toBe("time_tracking_entries_create");
    expect(parsed?.operationId).not.toContain("%7B");
    expect(parsed?.operationId).not.toContain("|");
  });

  it("hides a secrets_reveal grant context (secret id is not display copy)", () => {
    const parsed = parseToolApprovalArtifactId(
      buildArtifactId("secrets_reveal", {
        secret_id: "11111111-1111-4111-8111-111111111111",
      })
    );
    expect(parsed?.operationId).toBe("secrets_reveal");
    expect(parsed?.operationIds).toEqual(["secrets_reveal"]);
  });

  it("lists every operation a bulk pre-approval covers, primary first, de-duped", () => {
    const parsed = parseToolApprovalArtifactId(
      buildArtifactId("log_time_entry", {
        operation_ids: ["log_time_entry", "update_time_entry"],
      })
    );
    expect(parsed?.operationIds).toEqual([
      "log_time_entry",
      "update_time_entry",
    ]);
  });

  it("degrades to the primary operation when the grant context is malformed", () => {
    const parsed = parseToolApprovalArtifactId(
      "tool-approval|log_time_entry|not-json"
    );
    expect(parsed?.operationIds).toEqual(["log_time_entry"]);
  });

  it("drops operation ids that do not look like operation ids", () => {
    const parsed = parseToolApprovalArtifactId(
      buildArtifactId("log_time_entry", {
        operation_ids: ["ok_op", "bad op with spaces", 42],
      })
    );
    expect(parsed?.operationIds).toEqual(["log_time_entry", "ok_op"]);
  });
});
