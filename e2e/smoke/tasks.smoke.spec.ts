import { expect, test } from "@playwright/test";
import { gotoLoggedIn, t, tLoose, uniqueName } from "../helpers";

// Create (the app opens the new task's detail page) → delete via the
// task-actions menu → verify it is gone from module search. Exercises the
// tasks UI, the core API, and the DB round-trip end to end.
test("create, open, and delete a task", async ({ page }) => {
  const title = uniqueName("Smoke task");

  await gotoLoggedIn(page, "/mdl/tasks/list");

  // "Neu" menu in the module sidebar header → "Neue Aufgabe".
  await page
    .getByRole("button", { name: t("Neu", "New") })
    .first()
    .click();
  await page
    .getByRole("menuitem", { name: t("Neue Aufgabe", "New task") })
    .click();

  const titleInput = page.getByPlaceholder(t("Aufgabentitel", "Task title"));
  await titleInput.fill(title);
  await page
    .getByRole("button", { name: t("Aufgabe erstellen", "Create Task") })
    .click();

  // Creation lands on the task detail page with the title editable in place.
  const detailTitle = page.getByRole("textbox", { name: t("Titel", "Title") });
  await expect(detailTitle).toHaveValue(title, { timeout: 30_000 });

  // Delete via the task-actions menu (confirm dialog).
  await page
    .getByRole("button", { name: t("Aufgabenaktionen", "Task actions") })
    .click();
  await page.getByRole("menuitem", { name: t("Löschen", "Delete") }).click();
  const confirm = page.getByRole("alertdialog");
  await confirm.getByRole("button", { name: t("Löschen", "Delete") }).click();

  // Reload (the sidebar list caches client-side), then verify the module
  // search no longer finds it.
  await page.goto("/mdl/tasks/list");
  const search = page.getByPlaceholder(tLoose("suchen", "Search")).first();
  await search.fill(title);
  await expect(page.getByText(title)).toHaveCount(0);
});
