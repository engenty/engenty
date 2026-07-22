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
  // The module app bar renders only once the session settled. On a cold load
  // the first workspace-context request can race the freshly-minted session
  // (401) and the SPA does not retry — it hangs on "Loading session…". A single
  // reload picks up the now-persisted session; retry a couple of times before
  // giving up.
  for (let attempt = 0; ; attempt++) {
    try {
      await page.waitForSelector('a[href^="/mdl/"]', { timeout: 20_000 });
      return;
    } catch (error) {
      if (attempt >= 2) {
        throw error;
      }
      await page.reload({ waitUntil: "domcontentloaded" });
    }
  }
}

/**
 * Read the logged-in Supabase access token from the page's default localStorage
 * session store (`sb-<ref>-auth-token`). Call after gotoLoggedIn(); lets a spec
 * drive the JSON API (via page.request, same-origin through the Vite proxy) as
 * the same principal the UI uses.
 */
export async function apiAccessToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.includes("auth-token")) {
        continue;
      }
      try {
        const parsed = JSON.parse(localStorage.getItem(key) ?? "");
        const value =
          parsed?.access_token ?? parsed?.currentSession?.access_token;
        if (typeof value === "string" && value.length > 0) {
          return value;
        }
      } catch {
        // Not the session entry — keep scanning.
      }
    }
    return "";
  });
  if (!token) {
    throw new Error("No Supabase access token in localStorage after login");
  }
  return token;
}
