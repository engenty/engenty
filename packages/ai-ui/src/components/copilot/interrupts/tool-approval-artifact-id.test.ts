import { describe, expect, it } from "vitest";
import { parseToolApprovalArtifactId } from "./tool-approval-artifact-id.js";

describe("parseToolApprovalArtifactId", () => {
  it("returns null for artifacts that are not tool approvals", () => {
    expect(parseToolApprovalArtifactId("decision-123")).toBeNull();
    expect(parseToolApprovalArtifactId("")).toBeNull();
    expect(parseToolApprovalArtifactId("tool-approval|")).toBeNull();
  });

  it("degrades to the primary operation when the grant context is malformed", () => {
    const parsed = parseToolApprovalArtifactId(
      "tool-approval|log_time_entry|not-json"
    );
    expect(parsed?.operationIds).toEqual(["log_time_entry"]);
  });
});
