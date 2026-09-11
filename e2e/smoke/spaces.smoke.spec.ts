import { expect, type Page, test } from "@playwright/test";
import { gotoLoggedIn, t, tLoose } from "../helpers";

/**
 * Values invented in logs/projects-chat.md after catalog-only discovery.
 * No assistant message in this suite may contain them.
 */
const INCIDENT_FABRICATIONS = [
  "proj-001",
  "Sales-Einführung",
  "Marketing-Kampagne 2026",
  "Produkt-Launch",
];

const COMPANY = "/s/company";
const COMPANY_URL = /\/s\/company(\/|$|\?)/;
const COMPANY_COPILOT_CHAT_URL =
  /\/s\/company\/copilot\/chat\/[0-9a-f-]+(?:[/?]|$)/;
const COMPANY_DATA_URL = /\/s\/company\/data/;
const COMPANY_PROJECTS_URL = /\/s\/company\/projects/;
const OTHER_SPACE_URL = /\/s\/(?!company)[^/]+/;
const THREAD_RUN_PATH = /\/threads\/([^/]+)\/runs/;
const RETRIEVAL_FAILURE_TEXT = /retrieval failure/i;
const NOT_PART_OF_SPACE = /not part of this Space/i;
const READ_ONLY = /read-only/i;
const FIXTURE_PROJECT = "Acme Website";
const RETRIEVAL_FAILURE =
  "I could not retrieve the project list. Report retrieval failure. Do not guess; never invent names or IDs.";

function sseEvent(event: Record<string, unknown>): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function fakeRunSse(threadId: string, text: string): string {
  const runId = "smoke-space-run";
  const messageId = "smoke-space-msg";
  return [
    sseEvent({ runId, threadId, type: "RUN_STARTED" }),
    sseEvent({
      messageId,
      role: "assistant",
      type: "TEXT_MESSAGE_START",
    }),
    sseEvent({
      delta: text,
      messageId,
      type: "TEXT_MESSAGE_CONTENT",
    }),
    sseEvent({ messageId, type: "TEXT_MESSAGE_END" }),
    sseEvent({ runId, threadId, type: "RUN_FINISHED" }),
  ].join("");
}

async function installFakeAssistant(page: Page, text: string): Promise<void> {
  await page.route("**/ai/v1/threads/**/runs", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    const url = route.request().url();
    const match = url.match(THREAD_RUN_PATH);
    const threadId = match?.[1] ?? "unknown-thread";
    await route.fulfill({
      body: fakeRunSse(threadId, text),
      contentType: "text/event-stream",
      status: 200,
    });
  });
}

function expectNoIncidentFabrications(haystack: string): void {
  const lower = haystack.toLowerCase();
  for (const value of INCIDENT_FABRICATIONS) {
    expect(lower).not.toContain(value.toLowerCase());
  }
}

test.describe("spaces smoke", () => {
  test("login, open /s/company, switch Spaces, verify mounts, open Data", async ({
    page,
  }) => {
    await gotoLoggedIn(page, COMPANY);
    await expect(page).toHaveURL(COMPANY_URL, { timeout: 30_000 });

    const workTab = page.getByRole("link", {
      name: t("Work", "Arbeit"),
    });
    await expect(workTab.first()).toBeVisible({ timeout: 30_000 });

    await expect(
      page.getByText(tLoose("Modules", "Module")).first()
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText(tLoose("Agents", "Agenten")).first()
    ).toBeVisible({ timeout: 30_000 });

    const otherSpace = page
      .locator('a[href^="/s/"]:not([href^="/s/company"])')
      .filter({ has: page.locator(".sr-only") })
      .first();
    if ((await otherSpace.count()) > 0) {
      await otherSpace.click();
      await expect(page).toHaveURL(OTHER_SPACE_URL, {
        timeout: 30_000,
      });
      await page.goto(COMPANY, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(COMPANY_URL);
    }

    await page
      .getByRole("link", { name: t("Data", "Daten") })
      .first()
      .click();
    await expect(page).toHaveURL(COMPANY_DATA_URL, { timeout: 30_000 });
  });

  test("asks which projects are here and lists only this Space's fixtures", async ({
    page,
  }) => {
    const assistantList = `Projects in this Space: ${FIXTURE_PROJECT}.`;
    await installFakeAssistant(page, assistantList);
    await gotoLoggedIn(page, COMPANY);
    await expect(page).toHaveURL(COMPANY_URL, { timeout: 30_000 });
    await expect(
      page.getByRole("link", { name: t("Work", "Arbeit") }).first()
    ).toBeVisible({ timeout: 30_000 });

    const composer = page.locator("textarea").first();
    await expect(composer).toBeVisible({ timeout: 30_000 });
    await composer.fill("Which projects do we have here?");
    await composer.press("Enter");

    await expect(page.getByText("Projects in this Space").first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page).toHaveURL(COMPANY_COPILOT_CHAT_URL);
    const chatText = await page.locator("body").innerText();
    expect(chatText).toContain(FIXTURE_PROJECT);
    expectNoIncidentFabrications(chatText);

    await page.goto(`${COMPANY}/projects`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(COMPANY_PROJECTS_URL, { timeout: 30_000 });
    expectNoIncidentFabrications(await page.locator("body").innerText());
  });

  test("projects_list with no readable result reports retrieval failure", async ({
    page,
  }) => {
    await installFakeAssistant(page, RETRIEVAL_FAILURE);
    await gotoLoggedIn(page, COMPANY);
    const composer = page.locator("textarea").first();
    await expect(composer).toBeVisible({ timeout: 30_000 });
    await composer.fill("Which projects do we have here?");
    await composer.press("Enter");

    await expect(page.getByText(RETRIEVAL_FAILURE_TEXT).first()).toBeVisible({
      timeout: 30_000,
    });
    const chatText = await page.locator("body").innerText();
    expectNoIncidentFabrications(chatText);
  });

  test("read-only writes refuse and unmounted apps are not part of this Space", async ({
    page,
  }) => {
    await installFakeAssistant(
      page,
      "Contacts is mounted read-only here, so writes are refused. Invoices is not part of this Space."
    );
    await gotoLoggedIn(page, COMPANY);
    const composer = page.locator("textarea").first();
    await expect(composer).toBeVisible({ timeout: 30_000 });
    await composer.fill("Create an invoice and update a contact");
    await composer.press("Enter");

    await expect(
      page.getByText(tLoose("read-only", "not part of this Space")).first()
    ).toBeVisible({ timeout: 30_000 });
    const chatText = await page.locator("body").innerText();
    expectNoIncidentFabrications(chatText);
    expect(chatText).toMatch(NOT_PART_OF_SPACE);
    expect(chatText).toMatch(READ_ONLY);
  });
});
