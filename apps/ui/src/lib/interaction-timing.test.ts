import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CI_GROSS_REGRESSION,
  PRODUCT_CACHED_PAINT_P95_MS,
  PRODUCT_INTERACTION_RESPONSE_P95_MS,
  PRODUCT_MAIN_THREAD_TASK_MS,
  REACT_TRANSITION_EXPIRATION_MS,
} from "./interaction-budgets";
import { createInteractionSession, percentile } from "./interaction-timing";

describe("interaction budgets", () => {
  it("keeps CI gross thresholds looser than the product line", () => {
    expect(CI_GROSS_REGRESSION.interactionResponseP95Ms).toBeGreaterThan(
      PRODUCT_INTERACTION_RESPONSE_P95_MS
    );
    expect(CI_GROSS_REGRESSION.cachedPaintP95Ms).toBeGreaterThan(
      PRODUCT_CACHED_PAINT_P95_MS
    );
    expect(CI_GROSS_REGRESSION.interactionMaxMs).toBeLessThan(
      REACT_TRANSITION_EXPIRATION_MS
    );
    expect(PRODUCT_MAIN_THREAD_TASK_MS).toBe(50);
  });

  it("stays in sync with the Playwright budgets file", () => {
    const text = readFileSync(
      join(import.meta.dirname, "../../../../e2e/interaction-budgets.ts"),
      "utf8"
    );
    expect(text).toContain(
      `PRODUCT_INTERACTION_RESPONSE_P95_MS = ${PRODUCT_INTERACTION_RESPONSE_P95_MS}`
    );
    expect(text).toContain(
      `PRODUCT_CACHED_PAINT_P95_MS = ${PRODUCT_CACHED_PAINT_P95_MS}`
    );
    expect(text).toContain(
      `REACT_TRANSITION_EXPIRATION_MS = ${REACT_TRANSITION_EXPIRATION_MS}`
    );
    expect(text).toContain(
      `interactionResponseP95Ms: ${CI_GROSS_REGRESSION.interactionResponseP95Ms}`
    );
    expect(text).toContain("test:smoke:interaction");
    expect(text).toContain("useTransitions={false}");
  });
});

describe("percentile", () => {
  it("returns 0 for an empty set", () => {
    expect(percentile([], 95)).toBe(0);
  });

  it("uses nearest-rank p95", () => {
    expect(percentile([10, 20, 30, 40, 50], 95)).toBe(50);
    expect(percentile([40, 50, 55, 60, 66], 95)).toBe(66);
  });
});

describe("createInteractionSession", () => {
  it("records intent → URL → paint and ignores earlier long tasks", () => {
    let now = 1000;
    const session = createInteractionSession({
      mode: "development",
      now: () => now,
    });
    session.begin("space-switch");
    session.markLongTask({ duration: 80, startTime: 10 });
    now = 1040;
    session.markUrl();
    now = 1070;
    session.markPaint();
    session.markApi(12);
    session.markLongTask({ duration: 18, startTime: 1010 });
    const record = session.end();
    expect(record).toMatchObject({
      apiCompleteMs: 12,
      apiCount: 1,
      firstPaintMs: 70,
      longTaskMaxMs: 18,
      mode: "development",
      name: "space-switch",
      responseMs: 40,
      starvedByReactExpiration: false,
    });
    expect(record?.longTasks).toHaveLength(1);
  });

  it("flags a navigation that waited for React’s 5s expiration", () => {
    let now = 0;
    const session = createInteractionSession({
      mode: "production",
      now: () => now,
    });
    session.begin("space-switch");
    now = 5000;
    session.markUrl();
    const record = session.end();
    expect(record?.responseMs).toBe(5000);
    expect(record?.starvedByReactExpiration).toBe(true);
    expect(record?.mode).toBe("production");
  });
});
