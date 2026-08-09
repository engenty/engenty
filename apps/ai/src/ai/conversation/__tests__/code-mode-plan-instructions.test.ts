import { describe, expect, it } from "vitest";
import { CODE_MODE_PLAN_INSTRUCTIONS } from "../../../../ai/tools/engenty-tools/code-mode-plan-instructions.js";

describe("Code Mode plan-then-apply instructions", () => {
  it("tells the model to return a write plan instead of rows", () => {
    expect(CODE_MODE_PLAN_INSTRUCTIONS).toContain("write plan");
    expect(CODE_MODE_PLAN_INSTRUCTIONS).toMatch(/never return whole records/i);
  });

  it("steers batched writes over looping a single-item tool", () => {
    expect(CODE_MODE_PLAN_INSTRUCTIONS).toMatch(
      /never loop a single-item write tool/i
    );
    expect(CODE_MODE_PLAN_INSTRUCTIONS).toContain("create_many");
  });

  it("warns that the result is capped, so the model expects truncation", () => {
    expect(CODE_MODE_PLAN_INSTRUCTIONS).toMatch(/capped/i);
  });

  /**
   * Guards a live collision: gated writes from sandbox programs are being added
   * in a parallel session. If this prompt asserts that Code Mode is read-only,
   * it silently becomes a lie the moment that lands — and a stale policy claim
   * in the system prompt is worse than none, because the model will refuse to
   * attempt writes that are in fact allowed. Policy belongs to the dispatch
   * layer, which states it at the point of rejection.
   */
  it("does not hard-code a write policy that another change can invalidate", () => {
    expect(CODE_MODE_PLAN_INSTRUCTIONS).not.toMatch(/is read-only/i);
    expect(CODE_MODE_PLAN_INSTRUCTIONS).not.toMatch(/writes are rejected/i);
    expect(CODE_MODE_PLAN_INSTRUCTIONS).not.toContain("code_mode_read_only");
  });
});
