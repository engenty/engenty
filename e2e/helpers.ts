/** Dual-locale matcher: the dev tenant may run English or German UI. */
export function t(...labels: string[]): RegExp {
  const escaped = labels.map((label) =>
    label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );
  return new RegExp(`^(${escaped.join("|")})$`);
}

/** Loose (substring) dual-locale matcher. */
export function tLoose(...labels: string[]): RegExp {
  const escaped = labels.map((label) =>
    label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );
  return new RegExp(escaped.join("|"));
}

export function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now().toString(36)}`;
}

import type { Page } from "@playwright/test";

/**
 * Log in via /auth/agent-login and land on `path`. Each spec logs in with
 * its own fresh session: sharing one storageState across contexts breaks
 * under refresh-token rotation (the first context's boot refresh consumes
 * the token every other context still holds).
 */
export async function gotoLoggedIn(page: Page, path = "/"): Promise<void> {
  await page.goto(`/auth/agent-login?redirect=${encodeURIComponent(path)}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), {
    timeout: 60_000,
  });
  // The module app bar renders only when the session actually settled.
  await page.waitForSelector('a[href^="/mdl/"]', { timeout: 60_000 });
}
