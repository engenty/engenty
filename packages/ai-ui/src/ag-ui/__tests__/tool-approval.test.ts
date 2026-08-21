import { describe, expect, it } from "vitest";
import {
  isToolApprovalArtifactOutput,
  parseToolApprovalResolution,
  resolveToolApprovalChoiceVerdict,
} from "../tool-approval.js";

describe("parseToolApprovalResolution", () => {
  it("reads the verdict and the operation the user answered for", () => {
    expect(
      parseToolApprovalResolution({
        approved: true,
        operation_id: "tasks_list",
      })
    ).toEqual({ approved: true, operationIds: ["tasks_list"] });
    expect(
      parseToolApprovalResolution({
        approved: false,
        operation_id: "tasks_list",
      })
    ).toEqual({ approved: false, operationIds: ["tasks_list"] });
  });

  it("keeps every operation a bulk pre-approval covered, primary first", () => {
    expect(
      parseToolApprovalResolution({
        approved: true,
        operation_id: "time_tracking_entries_create",
        operation_ids: [
          "time_tracking_entries_create",
          "time_tracking_entries_update",
        ],
      })
    ).toEqual({
      approved: true,
      operationIds: [
        "time_tracking_entries_create",
        "time_tracking_entries_update",
      ],
    });
  });

  it("reads a resolution that arrives as raw JSON", () => {
    // The reloaded thread can hand the transcript the tool's raw output string.
    expect(
      parseToolApprovalResolution(
        JSON.stringify({ approved: true, operation_id: "tasks_list" })
      )
    ).toEqual({ approved: true, operationIds: ["tasks_list"] });
  });

  it("ignores payloads that are not an approval resolution", () => {
    // Both halves are required: an `approved` flag on some unrelated tool
    // result must never turn that row into an approval card.
    expect(parseToolApprovalResolution({ approved: true })).toBeNull();
    expect(
      parseToolApprovalResolution({ operation_id: "tasks_list" })
    ).toBeNull();
    expect(
      parseToolApprovalResolution({
        approved: true,
        operation_id: "not a valid id",
      })
    ).toBeNull();
    expect(parseToolApprovalResolution("The user selected: Ja")).toBeNull();
    expect(parseToolApprovalResolution(null)).toBeNull();
  });
});

describe("isToolApprovalArtifactOutput", () => {
  it("recognizes the gate's own artifact by its tagged id", () => {
    expect(
      isToolApprovalArtifactOutput({
        artifact_id: "tool-approval|tasks_list",
        artifact_type: "decision",
      })
    ).toBe(true);
    expect(
      isToolApprovalArtifactOutput({
        artifact_id: "artifact-1",
        artifact_type: "decision",
      })
    ).toBe(false);
  });
});

describe("resolveToolApprovalChoiceVerdict", () => {
  it("maps the gate's own options to a verdict", () => {
    expect(resolveToolApprovalChoiceVerdict("approve_once")).toBe(true);
    expect(resolveToolApprovalChoiceVerdict("approve_always")).toBe(true);
    expect(resolveToolApprovalChoiceVerdict("deny")).toBe(false);
  });

  it("refuses to guess for anything else", () => {
    // A custom answer must not fall through to "approved".
    expect(resolveToolApprovalChoiceVerdict("_custom")).toBeNull();
    expect(resolveToolApprovalChoiceVerdict("")).toBeNull();
  });
});
