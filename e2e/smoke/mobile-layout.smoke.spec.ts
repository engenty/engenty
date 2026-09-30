import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow, gotoLoggedIn } from "../helpers";

/**
 * Phone-width layout gate (Phase 0, PLAN-mobile.md).
 *
 * Deliberately shallow and broad: it walks the routes the mobile app will
 * actually ship and asserts the two things that make a page unusable on a
 * phone — sideways scroll, and chrome that has not collapsed. Depth per
 * surface belongs in that surface's own spec.
 */

const SPACE_PATH = /\/s\/[^/]+/;

const ROUTES: { label: string; path: string }[] = [
  { label: "copilot chat (home)", path: "/" },
  { label: "tasks", path: "/mdl/tasks" },
  { label: "inbox", path: "/mdl/inbox" },
];

test("no route scrolls sideways at phone width", async ({ page }) => {
  await gotoLoggedIn(page, "/");
  // `/` lands in a space: its home and Data tab cover the space surfaces
  // without hard-coding a space key.
  await page.waitForURL(SPACE_PATH, { timeout: 30_000 });
  const spaceHome = new URL(page.url()).pathname
    .split("/")
    .slice(0, 3)
    .join("/");
  const routes = [
    ...ROUTES,
    { label: "space home", path: spaceHome },
    { label: "space data", path: `${spaceHome}/data` },
  ];

  for (const route of routes) {
    await page.goto(route.path, { waitUntil: "domcontentloaded" });
    // Let the module's first paint settle; the check is about layout, not
    // data, so a visible app bar is enough of a signal.
    await page.waitForSelector("[data-shell-mobile-nav-trigger]", {
      timeout: 30_000,
    });
    await expectNoHorizontalOverflow(page, route.label);
  }
});

test("shell chrome collapses below the md breakpoint", async ({ page }) => {
  await gotoLoggedIn(page, "/");

  // The desktop sidebar rail must not occupy phone width; navigation is
  // reachable through the mobile nav sheet trigger instead.
  const trigger = page.locator("[data-shell-mobile-nav-trigger]");
  await expect(trigger).toBeVisible({ timeout: 30_000 });

  await trigger.click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();

  // The sheet must actually reach the app, not just open. Match both navigation
  // models: spaces (`/s/<key>`, where mirrored modules now live) and the
  // top-level module rail (`/mdl/<module>`), so this survives the merge in
  // either direction. Asserting only `/mdl/` passed on main and silently
  // described an empty sheet here.
  await expect(
    sheet.locator('a[href^="/s/"], a[href^="/mdl/"]').first()
  ).toBeVisible();
});
