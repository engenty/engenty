import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain .mjs guardrail script, no type declarations
import { findForeignSchemaScopeViolations } from "./check-foreign-schema-scope.mjs";

/**
 * Runs the cross-schema tenant-scope guardrail as part of `pnpm test`, so a new
 * unscoped read fails locally rather than only in CI.
 */
describe("check-foreign-schema-scope", () => {
  const result = findForeignSchemaScopeViolations();

  it("finds no unscoped cross-schema reads outside the baseline", () => {
    const described = result.violations.map(
      (v: { file: string; line: number; missing: string[] }) =>
        `${v.file}:${v.line} (missing ${v.missing.join(", ")})`
    );
    expect(described).toEqual([]);
  });

  it("keeps the baseline honest — every entry still matches a real violation", () => {
    expect(result.stale).toEqual([]);
  });

  it("still recognises time-tracking's foreign reads as scoped", () => {
    // This module was the reason the check exists; its catalog reads went
    // through foreignSelect in the same change. Pin it so a revert is loud.
    const timeTracking = [...result.violations, ...result.baselined].filter(
      (v: { file: string }) => v.file.startsWith("modules/time-tracking/")
    );
    expect(timeTracking).toEqual([]);
  });
});
