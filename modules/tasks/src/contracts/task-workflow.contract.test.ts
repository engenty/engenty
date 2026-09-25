/**
 * Contract tests — written in Phase 0, must pass unchanged through Phase 7.
 *
 * These tests define platform behavior for tasks independent of storage.
 * Phase 7 adds projects integration tests that rely on the same contracts
 * via tasks operations + task_contexts links.
 */
import { describe, expect, it } from "vitest";
import {
  formatTaskIdentifier,
  isValidTaskIdentifier,
} from "../domain/task-lifecycle.js";

describe("task identifier contract", () => {
  it("formats prefix and sequence as ENG-142", () => {
    expect(formatTaskIdentifier("eng", 142)).toBe("ENG-142");
    expect(formatTaskIdentifier("ACME", 1)).toBe("ACME-1");
  });

  it("rejects invalid prefix or sequence", () => {
    expect(() => formatTaskIdentifier("", 1)).toThrow(
      "task_identifier_prefix_required"
    );
    expect(() => formatTaskIdentifier("ENG", 0)).toThrow(
      "task_identifier_sequence_invalid"
    );
  });

  it("validates identifier pattern", () => {
    expect(isValidTaskIdentifier("ENG-142")).toBe(true);
    expect(isValidTaskIdentifier("eng-142")).toBe(false);
    expect(isValidTaskIdentifier("ENG142")).toBe(false);
  });
});

/**
 * Phase 7 projects integration scenarios live in
 * modules/projects/src/contracts/tasks-integration.contract.test.ts
 */
