import { expect, test } from "@playwright/test";
import { gotoLoggedIn, t, tLoose, uniqueName } from "../helpers";

// Posts into a dedicated "smoke-e2e" channel (created on first run) — never
// into real channels, which may be bridged to external Slack.
const CHANNEL = "smoke-e2e";

test("open the smoke channel and post a message", async ({ page }) => {
  const message = uniqueName("Smoke ping");

  await gotoLoggedIn(page, "/mdl/team-chat");
  await expect(page.locator('a[href^="/mdl/team-chat/"]').first()).toBeVisible({
    timeout: 30_000,
  });

  const channelLink = page
    .locator('a[href^="/mdl/team-chat/"]')
    .filter({ hasText: CHANNEL });
  if ((await channelLink.count()) === 0) {
    await page
      .getByRole("button", { name: t("Channel hinzufügen", "Add channel") })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox").first().fill(CHANNEL);
    await dialog
      .getByRole("button", { name: t("Erstellen", "Create") })
      .click();
    // Land on the channel regardless of whether creation auto-navigates.
    await page.goto("/mdl/team-chat");
  }
  await expect(channelLink.first()).toBeVisible({ timeout: 30_000 });
  await channelLink.first().click();

  // The composer placeholder is "Nachricht an <name>" / "Message <name>" —
  // NOT the message-search box ("Nachrichten durchsuchen").
  const composer = page.getByPlaceholder(
    tLoose(`Nachricht an #${CHANNEL}`, `Message #${CHANNEL}`)
  );
  await expect(composer.first()).toBeVisible({ timeout: 30_000 });
  await composer.first().fill(message);
  await composer.first().press("Enter");

  await expect(page.getByText(message).first()).toBeVisible();
});
