import { expect, type Page } from "@playwright/test";
import { apiAccessToken } from "./helpers";
import {
  CI_GROSS_REGRESSION,
  PRODUCT_CACHED_PAINT_P95_MS,
  PRODUCT_INTERACTION_RESPONSE_P95_MS,
  percentile,
  REACT_TRANSITION_EXPIRATION_MS,
} from "./interaction-budgets";
import {
  type MeasuredInteraction,
  paintMs,
  responseMs,
} from "./interaction-measure";

export const INTERACTION_REPORT = {
  budgets: {
    ciGross: CI_GROSS_REGRESSION,
    product: {
      cachedPaintP95Ms: PRODUCT_CACHED_PAINT_P95_MS,
      interactionResponseP95Ms: PRODUCT_INTERACTION_RESPONSE_P95_MS,
      reactTransitionExpirationMs: REACT_TRANSITION_EXPIRATION_MS,
    },
  },
  mode: null as string | null,
  rows: [] as Array<{
    name: string;
    paintMs: number;
    responseMs: number;
    starvedByReactExpiration: boolean;
    wallMs: number;
  }>,
};

export function collectInteraction(row: MeasuredInteraction): void {
  INTERACTION_REPORT.mode = row.client?.mode ?? INTERACTION_REPORT.mode;
  INTERACTION_REPORT.rows.push({
    name: row.name,
    paintMs: paintMs(row),
    responseMs: responseMs(row),
    starvedByReactExpiration: row.client?.starvedByReactExpiration ?? false,
    wallMs: row.wallMs,
  });
}

export function assertGrossRegression(
  label: string,
  rows: MeasuredInteraction[]
): void {
  const responses = rows.map(responseMs);
  const paints = rows.map(paintMs);
  const p95 = percentile(responses, 95);
  const paintP95 = percentile(paints, 95);
  const max = Math.max(...responses, 0);
  expect(
    rows.some((row) => row.client?.starvedByReactExpiration),
    `${label}: a navigation waited for React’s ${REACT_TRANSITION_EXPIRATION_MS}ms expiration`
  ).toBe(false);
  expect(
    max,
    `${label}: max ${max}ms (CI gross < ${CI_GROSS_REGRESSION.interactionMaxMs}ms)`
  ).toBeLessThan(CI_GROSS_REGRESSION.interactionMaxMs);
  expect(
    p95,
    `${label}: p95 ${p95}ms (CI gross < ${CI_GROSS_REGRESSION.interactionResponseP95Ms}ms; product ${PRODUCT_INTERACTION_RESPONSE_P95_MS}ms)`
  ).toBeLessThan(CI_GROSS_REGRESSION.interactionResponseP95Ms);
  expect(
    paintP95,
    `${label}: cached paint p95 ${paintP95}ms (CI gross < ${CI_GROSS_REGRESSION.cachedPaintP95Ms}ms)`
  ).toBeLessThan(CI_GROSS_REGRESSION.cachedPaintP95Ms);
  for (const row of rows) {
    expect(row.client?.longTaskMaxMs ?? 0).toBeLessThan(
      CI_GROSS_REGRESSION.longTaskMaxMs
    );
  }
}

export function spaceSwitcherLink(page: Page, pattern: string) {
  return page
    .locator(`a[href="${pattern}"], a[href^="${pattern}/"]`)
    .filter({ has: page.locator(".sr-only") })
    .first();
}

export function otherSpaceSwitcherLink(page: Page) {
  return page
    .locator('a[href^="/s/"]:not([href^="/s/company"])')
    .filter({ has: page.locator(".sr-only") })
    .first();
}

export async function ensureSecondSpace(page: Page): Promise<boolean> {
  if ((await otherSpaceSwitcherLink(page).count()) > 0) {
    return true;
  }
  const token = await apiAccessToken(page);
  const res = await page.request.post("/api/spaces", {
    data: { key: "perf-switch", name: "Perf switch" },
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
  });
  if (!res.ok() && res.status() !== 409) {
    return false;
  }
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(
    'a[href^="/mdl/"], [data-shell-mobile-nav-trigger]',
    { timeout: 20_000 }
  );
  return (await otherSpaceSwitcherLink(page).count()) > 0;
}
