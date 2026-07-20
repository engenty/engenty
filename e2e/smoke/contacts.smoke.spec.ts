import { expect, test } from "@playwright/test";
import { gotoLoggedIn, t, tLoose, uniqueName } from "../helpers";

test("create a person contact and see it in the list", async ({ page }) => {
  const lastName = uniqueName("Smoketest");

  await gotoLoggedIn(page, "/mdl/contacts");
  const addButton = page.getByRole("button", {
    name: t("Hinzufügen", "Add"),
  });
  await expect(addButton.first()).toBeVisible({ timeout: 30_000 });
  await addButton.first().click();

  await page
    .getByRole("menuitem", { name: t("Person hinzufügen", "Add Person") })
    .click();

  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: tLoose("Vollständiger Name", "Full name") })
    .fill(`Smoke ${lastName}`);
  await dialog.getByRole("button", { name: t("Erstellen", "Create") }).click();

  await expect(page.getByText(tLoose(lastName)).first()).toBeVisible();
});
