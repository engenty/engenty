import { expect, test } from "@playwright/test";
import { gotoLoggedIn, t, tLoose, uniqueName } from "../helpers";

const PROJECT_DETAIL_URL = /\/mdl\/projects\/[0-9a-f-]{36}/;

// Create via the list-header button → open detail → delete via row selection.
test("create, open, and delete a project", async ({ page }) => {
  const name = uniqueName("Smoke project");

  await gotoLoggedIn(page, "/mdl/projects");
  // The icon-only sidebar create button shares the accessible name — target
  // the header button, which renders the label as visible text.
  const addButton = page
    .getByRole("button", { name: t("Projekt hinzufügen", "Add project") })
    .filter({ hasText: tLoose("Projekt hinzufügen", "Add project") });
  await expect(addButton.first()).toBeVisible({ timeout: 30_000 });
  await addButton.first().click();

  const titleInput = page.getByPlaceholder(t("Projekttitel", "Project title"));
  await titleInput.fill(name);
  await page.getByRole("button", { name: t("Erstellen", "Create") }).click();
  await expect(titleInput).toBeHidden({ timeout: 30_000 });

  // Reload for a fresh list query, then open the new project's detail page.
  await page.reload();
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row.first()).toBeVisible({ timeout: 30_000 });
  await row.first().click();
  await page.waitForURL(PROJECT_DETAIL_URL, { timeout: 30_000 });
  await expect(page.getByText(name).first()).toBeVisible();

  // Back to the list: select the row and bulk-delete it (confirm dialog).
  await gotoLoggedIn(page, "/mdl/projects");
  const rowAgain = page.getByRole("row").filter({ hasText: name });
  await rowAgain.first().getByRole("checkbox").check();
  await page
    .getByRole("button", { name: tLoose("löschen", "Delete") })
    .first()
    .click();
  const confirm = page.getByRole("dialog", {
    name: t("Projekt löschen?", "Delete this project?"),
  });
  await confirm.getByRole("button", { name: t("Löschen", "Delete") }).click();
  await expect(page.getByRole("row").filter({ hasText: name })).toHaveCount(0);
});
