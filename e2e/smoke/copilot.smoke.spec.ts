import { expect, test } from "@playwright/test";
import { gotoLoggedIn } from "../helpers";

const PONG = /pong/i;

// Streams a real model response through apps/ai — needs an AI gateway key,
// so it only runs when explicitly enabled.
test("copilot answers a chat message", async ({ page }) => {
  test.skip(
    process.env.ENGENTY_SMOKE_LLM !== "1",
    "LLM smoke disabled (set ENGENTY_SMOKE_LLM=1 to enable)"
  );

  await gotoLoggedIn(page, "/mdl/engenty-copilot/chat/new");
  const composer = page.locator("textarea").first();
  await expect(composer).toBeVisible({ timeout: 30_000 });

  await composer.fill("Reply with the single word: pong");
  await composer.press("Enter");

  await expect(page.getByText(PONG).first()).toBeVisible({
    timeout: 90_000,
  });
});
