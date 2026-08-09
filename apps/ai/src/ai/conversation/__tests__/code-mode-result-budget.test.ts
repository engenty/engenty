import { describe, expect, it } from "vitest";
import {
  capCodeModeOutcome,
  shrinkValue,
} from "../../../../ai/tools/engenty-tools/code-mode-result-budget.js";

/** Shaped like the real offender: a project tree of phases and tasks. */
function projectTree(taskCount: number) {
  return {
    project: "CRM-200",
    phases: Array.from({ length: taskCount }, (_, i) => ({
      discipline: "dev",
      hours: 8,
      id: `019fe120-83ab-7fc2-bf67-732ce4f679${String(i).padStart(2, "0")}`,
      title: `Task ${i} with a reasonably long German title for realism`,
      window: "Mai-Jun",
    })),
  };
}

describe("Code Mode results stay within a byte budget", () => {
  it("leaves a small result untouched", () => {
    const outcome = {
      logs: ["done"],
      result: { count: 3 },
      success: true,
    };
    const capped = capCodeModeOutcome(outcome);

    expect(capped.result).toEqual({ count: 3 });
    expect(capped.logs).toEqual(["done"]);
    expect(capped.notice).toBeUndefined();
  });

  it("truncates an 88 KB project dump and says what it dropped", () => {
    const result = projectTree(600);
    expect(JSON.stringify(result).length).toBeGreaterThan(80_000);

    const capped = capCodeModeOutcome({ logs: [], result, success: true });

    expect(JSON.stringify(capped.result).length).toBeLessThan(14_000);
    expect(capped.notice).toContain("truncated");
    const phases = (
      capped.result as { phases: { omitted: number; total: number } }
    ).phases;
    expect(phases.total).toBe(600);
    expect(phases.omitted).toBeGreaterThan(0);
  });

  it("keeps small sibling fields intact while shrinking the big one", () => {
    const capped = capCodeModeOutcome({
      logs: [],
      result: { note: "hello", rows: projectTree(600).phases },
      success: true,
    });

    // The cheap field survives verbatim; only `rows` pays.
    expect((capped.result as { note: string }).note).toBe("hello");
  });

  it("still shows one row when a single element exceeds the budget", () => {
    const huge = { blob: "x".repeat(50_000) };
    const shrunk = shrinkValue([huge], 1000);
    const value = shrunk.value as { items: unknown[]; total: number };

    expect(value.items).toHaveLength(1);
    expect(value.total).toBe(1);
    expect(JSON.stringify(value).length).toBeLessThan(2000);
  });

  it("truncates a giant top-level string", () => {
    const shrunk = shrinkValue("y".repeat(40_000), 1000);

    expect(typeof shrunk.value).toBe("string");
    expect(shrunk.truncated).toBe(true);
    expect(shrunk.value as string).toContain("40000 characters total");
  });

  it("caps console output and keeps logs a string array", () => {
    const capped = capCodeModeOutcome({
      logs: Array.from(
        { length: 500 },
        (_, i) => `line ${i} ${"z".repeat(80)}`
      ),
      result: { ok: true },
      success: true,
    });

    expect(Array.isArray(capped.logs)).toBe(true);
    for (const line of capped.logs) {
      expect(typeof line).toBe("string");
    }
    expect(capped.logs.at(-1)).toContain("500 lines total");
    expect(JSON.stringify(capped.logs).length).toBeLessThan(4000);
  });

  it("passes an error outcome through untouched", () => {
    const capped = capCodeModeOutcome({
      error: { message: "boom", name: "TypeError" },
      logs: [],
      success: false,
    });

    expect(capped.success).toBe(false);
    expect(capped.error).toEqual({ message: "boom", name: "TypeError" });
    expect(capped.result).toBeUndefined();
  });

  it("survives a cyclic result instead of throwing", () => {
    const cyclic: Record<string, unknown> = { name: "root" };
    cyclic.self = cyclic;

    expect(() =>
      capCodeModeOutcome({ logs: [], result: cyclic, success: true })
    ).not.toThrow();
  });
});
