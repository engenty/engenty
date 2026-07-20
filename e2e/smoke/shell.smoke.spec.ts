import { expect, test } from "@playwright/test";
import { gotoLoggedIn } from "../helpers";

const AUTH_URL = /\/auth\//;

test("app shell renders with module navigation after login", async ({
  page,
}) => {
  await gotoLoggedIn(page, "/");
  await expect(page.locator('a[href="/mdl/tasks"]')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page).not.toHaveURL(AUTH_URL);

  // The app bar exposes every active module as a /mdl/* link.
  const moduleLinks = page.locator('a[href^="/mdl/"]');
  expect(await moduleLinks.count()).toBeGreaterThanOrEqual(8);
});
