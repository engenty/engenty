import { expect, test } from "@playwright/test";
import { gotoLoggedIn, t, uniqueName } from "../helpers";
import {
  assertGrossRegression,
  collectInteraction,
  ensureSecondSpace,
  INTERACTION_REPORT,
  otherSpaceSwitcherLink,
  spaceSwitcherLink,
} from "../interaction-assert";
import {
  type MeasuredInteraction,
  measureNamedInteraction,
  writeInteractionTimings,
} from "../interaction-measure";

/**
 * Interaction smoke — run on every `pnpm test:smoke`.
 *
 * Required on react / react-dom / react-router-dom upgrades. The app opts
 * `BrowserRouter` out of `startTransition` (`useTransitions={false}` in
 * `apps/ui/src/main.tsx`) because `useSyncExternalStore` updates starve the
 * transition lane until React’s 5s expiration. Re-evaluate that flag here
 * before removing it: warm space-switch p95 must stay under 100ms with zero
 * 5s outliers.
 */

const COMPANY = "/s/company";
const COMPANY_URL = /\/s\/company(\/|$|\?)/;
const OTHER_SPACE_URL = /\/s\/(?!company)[^/]+/;
const TASKS_MODULE_URL = /\/mdl\/tasks/;
const TASK_DETAIL_URL = /\/mdl\/tasks\/(?!list).+/;
const SWITCH_ITERS = Number.parseInt(
  process.env.ENGENTY_INTERACTION_ITERS ?? "12",
  10
);

test.afterAll(() => {
  const file = writeInteractionTimings(INTERACTION_REPORT);
  console.info(`interaction timings → ${file}`);
});

test.describe("interaction budgets", () => {
  test("warm space switch stays off React’s 5s expiration", async ({
    page,
  }) => {
    await gotoLoggedIn(page, COMPANY);
    test.skip(
      !(await ensureSecondSpace(page)),
      "needs a second space to switch to"
    );

    const rows: MeasuredInteraction[] = [];
    for (let i = 0; i < SWITCH_ITERS; i++) {
      const toCompany = i % 2 === 1;
      const target = toCompany
        ? spaceSwitcherLink(page, COMPANY)
        : otherSpaceSwitcherLink(page);
      await expect(target).toBeVisible({ timeout: 15_000 });
      const row = await measureNamedInteraction(
        page,
        "space-switch",
        async () => {
          await target.click();
          await page.waitForURL(toCompany ? COMPANY_URL : OTHER_SPACE_URL, {
            timeout: 15_000,
          });
        }
      );
      if (i > 0) {
        rows.push(row);
        collectInteraction(row);
      }
    }
    assertGrossRegression("space-switch", rows);
  });

  test("opening the copilot is a local interaction", async ({ page }) => {
    await gotoLoggedIn(page, "/mdl/tasks/list");
    const trigger = page.locator("[data-copilot-trigger]").first();
    await expect(trigger).toBeVisible({ timeout: 30_000 });
    if ((await trigger.getAttribute("aria-pressed")) === "true") {
      await trigger.click();
      await expect(trigger).toHaveAttribute("aria-pressed", "false", {
        timeout: 10_000,
      });
    }
    const row = await measureNamedInteraction(
      page,
      "copilot-open",
      async () => {
        await trigger.click();
        await expect(
          page
            .locator(
              "[data-copilot-drawer-panel], [data-copilot-trigger][aria-pressed='true']"
            )
            .first()
        ).toBeVisible({ timeout: 15_000 });
      }
    );
    collectInteraction(row);
    assertGrossRegression("copilot-open", [row]);
  });

  test("module navigation updates the URL without a 5s stall", async ({
    page,
  }) => {
    await gotoLoggedIn(page, COMPANY);
    const link = page.locator('a[href="/mdl/tasks"]').first();
    await expect(link).toBeVisible({ timeout: 30_000 });
    const row = await measureNamedInteraction(page, "module-nav", async () => {
      await link.click();
      await page.waitForURL(TASKS_MODULE_URL, { timeout: 15_000 });
    });
    collectInteraction(row);
    assertGrossRegression("module-nav", [row]);
  });

  test("list-to-detail paints from cached chrome", async ({ page }) => {
    const title = uniqueName("Perf task");
    await gotoLoggedIn(page, "/mdl/tasks/list");
    await page
      .getByRole("button", { name: t("Neu", "New") })
      .first()
      .click();
    await page
      .getByRole("menuitem", { name: t("Neue Aufgabe", "New task") })
      .click();
    await page.getByPlaceholder(t("Aufgabentitel", "Task title")).fill(title);
    await page
      .getByRole("button", { name: t("Aufgabe erstellen", "Create Task") })
      .click();
    await expect(
      page.getByRole("textbox", { name: t("Titel", "Title") })
    ).toHaveValue(title, { timeout: 30_000 });

    await page.goto("/mdl/tasks/list", { waitUntil: "domcontentloaded" });
    const rowLink = page.getByText(title).first();
    await expect(rowLink).toBeVisible({ timeout: 30_000 });
    const row = await measureNamedInteraction(
      page,
      "list-to-detail",
      async () => {
        await rowLink.click();
        await page.waitForURL(TASK_DETAIL_URL, { timeout: 15_000 });
      }
    );
    collectInteraction(row);
    assertGrossRegression("list-to-detail", [row]);
  });

  test("dialog open is not blocked on network", async ({ page }) => {
    await gotoLoggedIn(page, "/mdl/contacts");
    const addButton = page.getByRole("button", {
      name: t("Hinzufügen", "Add"),
    });
    await expect(addButton.first()).toBeVisible({ timeout: 30_000 });
    await addButton.first().click();
    const item = page.getByRole("menuitem", {
      name: t("Person hinzufügen", "Add Person"),
    });
    await expect(item).toBeVisible();
    const row = await measureNamedInteraction(page, "dialog-open", async () => {
      await item.click();
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
    });
    collectInteraction(row);
    assertGrossRegression("dialog-open", [row]);
    await page.keyboard.press("Escape");
  });
});
