import { expect, type Page, test } from "@playwright/test";
import { apiAccessToken, gotoLoggedIn, t, tLoose } from "../helpers";

/**
 * One space, end to end, through the rendered UI:
 *
 *   1. the create-space wizard (Research template → tasks + knowledge base)
 *      and its fifth step, which hires the first engenty;
 *   2. a second agent hired from the roster page, reporting to the first;
 *   3. agent intercom — the first engenty is @-mentioned a colleague and hands
 *      the message off with `message_agent`, which leaves a pair thread and a
 *      marker in the colleague's room (REAL model turn, no stub);
 *   4. the knowledge base the mount created, plus a manual source added with
 *      the add-source wizard.
 *
 * Serial: every step builds on the space the first one created. Names carry a
 * per-run tag so reruns never collide on the space key or the agent ids.
 */

const TAG = Date.now().toString(36);
const SPACE_NAME = `E2E Space ${TAG}`;
const SPACE_KEY = `e2e-space-${TAG}`;
const CHIEF_NAME = `Chief ${TAG}`;
const CHIEF_ID = `chief-${TAG}`;
const SCOUT_NAME = `Scout ${TAG}`;
const SCOUT_ID = `scout-${TAG}`;
const SOURCE_TITLE = `E2E manual source ${TAG}`;
const SOURCE_BODY = [
  `# Onboarding note ${TAG}`,
  "",
  "The e2e lane writes this text into the space's knowledge base as a manual source.",
  "It exists so the add-source wizard has something to fetch and ingest.",
].join("\n");

// Template tiles name themselves "<name> <description>".
const RESEARCH_TEMPLATE = /^(Research|Forschung)\b/;

const deskUrl = (agentId: string) =>
  new RegExp(`/s/${SPACE_KEY}/agents/${agentId}(?:[/?#]|$)`);

/**
 * Bare arrays, `{ok,data:[…]}` envelopes and paginated `{ok,data:{data:[…]}}`
 * all occur — read whichever arrives.
 */
function rows(json: unknown): Record<string, unknown>[] {
  if (Array.isArray(json)) {
    return json as Record<string, unknown>[];
  }
  const data = (json as { data?: unknown })?.data;
  return data === undefined || data === null ? [] : rows(data);
}

async function apiClient(page: Page) {
  const token = await apiAccessToken(page);
  return async (url: string) => {
    const res = await page.request.get(url, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.ok(), `GET ${url} → ${res.status()}`).toBeTruthy();
    return res.json();
  };
}

async function findSpaceId(page: Page): Promise<string> {
  const get = await apiClient(page);
  const space = rows(await get("/api/spaces")).find((s) => s.key === SPACE_KEY);
  expect(space, `space ${SPACE_KEY} listed by /api/spaces`).toBeTruthy();
  return String(space?.id);
}

test.describe.configure({ mode: "serial" });

test.describe("space lifecycle", () => {
  test("create a space with the wizard and hire the first engenty", async ({
    page,
  }) => {
    await gotoLoggedIn(page, "/s/company");

    await page
      .getByRole("button", { name: t("New space", "Neuer Space") })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", {
        name: t("New space", "Neuen Space erstellen"),
      })
    ).toBeVisible({ timeout: 30_000 });

    // Step 1 — basics. The key is derived from the name and previewed.
    await dialog.locator("#space-name").fill(SPACE_NAME);
    await expect(dialog.getByText(`/${SPACE_KEY}`)).toBeVisible();
    await dialog.getByRole("button", { name: RESEARCH_TEMPLATE }).click();
    await dialog.getByRole("button", { name: t("Continue", "Weiter") }).click();

    // Step 2 — modules (template preselects tasks + knowledge base).
    await dialog.getByRole("button", { name: t("Continue", "Weiter") }).click();

    // Step 3 — capabilities; the button reads "Skip for now" when nothing
    // optional is selected.
    await dialog
      .getByRole("button", {
        name: t("Continue", "Weiter", "Skip for now", "Vorerst überspringen"),
      })
      .click();

    // Step 4 — review → POST /api/spaces.
    await dialog
      .getByRole("button", { name: t("Create space", "Space erstellen") })
      .click();

    // Step 5 — first engenty, pre-filled; renaming re-slugs the agent id.
    const hireName = dialog.locator("#space-agent-hire-name");
    await expect(hireName).toBeVisible({ timeout: 60_000 });
    await hireName.fill(CHIEF_NAME);
    await dialog.getByRole("button", { name: t("Hire", "Einstellen") }).click();

    await expect(page).toHaveURL(deskUrl(CHIEF_ID), { timeout: 60_000 });
    await expect(
      page.getByPlaceholder(
        tLoose(`Message ${CHIEF_NAME}`, `Nachricht an ${CHIEF_NAME}`)
      )
    ).toBeVisible({ timeout: 30_000 });

    // The wizard's mounts landed: the module and the engenty are on the space.
    const spaceId = await findSpaceId(page);
    const get = await apiClient(page);
    const mounts = rows(await get(`/api/spaces/${spaceId}/mounts`));
    const mountKeys = mounts.map((m) => `${m.resourceType}:${m.resourceKey}`);
    expect(mountKeys).toContain("module:knowledge-base");
    expect(mountKeys).toContain("module:tasks");
    expect(mountKeys).toContain(`agent:${CHIEF_ID}`);
  });

  test("hire a second agent from the roster, reporting to the first", async ({
    page,
  }) => {
    await gotoLoggedIn(page, `/s/${SPACE_KEY}/agents`);
    await expect(
      page.locator(`a[href$="/s/${SPACE_KEY}/agents/${CHIEF_ID}"]`).first()
    ).toBeVisible({ timeout: 30_000 });

    await page
      .getByRole("button", { name: t("Hire an agent", "Agent einstellen") })
      .first()
      .click();
    await page
      .getByRole("menuitem", {
        name: t("Wizard step by step", "Schritt-für-Schritt-Assistent"),
      })
      .click();

    const dialog = page.getByRole("dialog");
    await dialog.locator("#space-agent-hire-name").fill(SCOUT_NAME);
    await dialog
      .locator("#space-agent-hire-description")
      .fill("Answers colleague messages in one short line.");

    // "Reports to" only renders once another hired agent exists — it must now.
    const reportsTo = dialog.locator("#space-agent-hire-reports-to");
    await expect(reportsTo).toBeVisible();
    await reportsTo.click();
    await page.getByRole("option", { name: CHIEF_NAME }).click();

    await dialog
      .getByRole("button", { name: t("Get started", "Loslegen") })
      .click();
    await expect(page).toHaveURL(deskUrl(SCOUT_ID), { timeout: 60_000 });

    const spaceId = await findSpaceId(page);
    const get = await apiClient(page);
    const scoutMount = rows(await get(`/api/spaces/${spaceId}/mounts`)).find(
      (m) => m.resourceType === "agent" && m.resourceKey === SCOUT_ID
    );
    expect(scoutMount, "scout is mounted on the space").toBeTruthy();
    expect(scoutMount?.reportsTo).toBe(CHIEF_ID);

    // Both show on the roster.
    await page.goto(`/s/${SPACE_KEY}/agents`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.locator(`a[href$="/s/${SPACE_KEY}/agents/${SCOUT_ID}"]`).first()
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.locator(`a[href$="/s/${SPACE_KEY}/agents/${CHIEF_ID}"]`).first()
    ).toBeVisible();
  });

  test("agent intercom: an @-mentioned colleague receives the hand-off", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await gotoLoggedIn(page, `/s/${SPACE_KEY}/agents/${CHIEF_ID}`);
    const composer = page
      .getByPlaceholder(
        tLoose(`Message ${CHIEF_NAME}`, `Nachricht an ${CHIEF_NAME}`)
      )
      .first();
    await expect(composer).toBeVisible({ timeout: 30_000 });

    // "@Sco" opens the mention popover; picking the row inserts "@<name> "
    // and attaches the ai:agent ref the server turns into
    // `user_mentioned_agents`.
    await composer.click();
    await composer.pressSequentially("@Scout", { delay: 30 });
    const mentions = page.getByRole("region", { name: "Mentions" });
    await expect(mentions).toBeVisible({ timeout: 15_000 });
    await mentions
      .getByRole("option", { name: new RegExp(SCOUT_NAME) })
      .first()
      .click();
    await expect(composer).toHaveValue(new RegExp(`@${SCOUT_NAME}`));

    await composer.pressSequentially(
      "please take this: reply with the single word PONG. Hand it off with message_agent in notify mode and do not answer on their behalf.",
      { delay: 5 }
    );
    await composer.press("Enter");

    // Proof the message crossed over: the pair thread between the two agents
    // exists in this space (created by message_agent, either mode).
    const spaceId = await findSpaceId(page);
    const get = await apiClient(page);
    const findPairThread = async () => {
      const json = (await get(
        `/ai/threads?space_id=${spaceId}&agent_id=${SCOUT_ID}&limit=50`
      )) as { sessions?: Record<string, unknown>[] };
      return (
        (json.sessions ?? []).find((s) => {
          const pair = (s.route_context as { agent_pair?: string[] })
            ?.agent_pair;
          return (
            Array.isArray(pair) &&
            pair.includes(CHIEF_ID) &&
            pair.includes(SCOUT_ID)
          );
        }) ?? null
      );
    };
    await expect
      .poll(async () => (await findPairThread())?.id ?? null, {
        intervals: [3000],
        message: "agent pair thread",
        timeout: 240_000,
      })
      .not.toBeNull();
    const pairThread = await findPairThread();
    expect(String(pairThread?.title)).toContain("⇄");

    // The colleague's desk shows the marker the hand-off appended to its room:
    // a "Message from <sender>" link into the pair thread.
    await page.goto(`/s/${SPACE_KEY}/agents/${SCOUT_ID}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page
        .getByRole("link", {
          name: tLoose(
            `Message from ${CHIEF_NAME}`,
            `Nachricht von ${CHIEF_NAME}`
          ),
        })
        .first()
    ).toBeVisible({ timeout: 60_000 });

    // And the answer travels back: the colleague's reply is marked in the
    // sender's room. The colleague's run is detached, so reload until it lands.
    await expect
      .poll(
        async () => {
          await page.goto(`/s/${SPACE_KEY}/agents/${CHIEF_ID}`, {
            waitUntil: "domcontentloaded",
          });
          return page
            .getByRole("link", {
              name: tLoose(
                `Message from ${SCOUT_NAME}`,
                `Nachricht von ${SCOUT_NAME}`
              ),
            })
            .first()
            .waitFor({ state: "visible", timeout: 10_000 })
            .then(() => true)
            .catch(() => false);
        },
        { intervals: [5000], message: "reply marker", timeout: 180_000 }
      )
      .toBe(true);
  });

  test("the mount created the knowledge base; add a manual source", async ({
    page,
  }) => {
    await gotoLoggedIn(page, `/s/${SPACE_KEY}/kb`);
    const spaceId = await findSpaceId(page);
    const get = await apiClient(page);

    // kb_space_mount ran on create: exactly one KB, keyed off the space.
    const kbs = rows(await get(`/api/kb/knowledge-bases?space_id=${spaceId}`));
    expect(kbs).toHaveLength(1);
    expect(kbs[0]?.slug).toBe(`${SPACE_KEY}-kb`);
    const kbId = String(kbs[0]?.id);
    await expect(
      page.getByRole("button", {
        name: t("Set up knowledge base", "Wissensdatenbank einrichten"),
      })
    ).toHaveCount(0);

    // Add-source wizard: type → set up (manual) → test fetch → output.
    await page.goto(`/s/${SPACE_KEY}/kb/sources/new`, {
      waitUntil: "domcontentloaded",
    });
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", {
        name: t("Add source", "Quelle hinzufügen"),
      })
    ).toBeVisible({ timeout: 30_000 });
    await dialog
      .getByRole("button", { name: tLoose("Write text", "Text schreiben") })
      .click(); // picking a kind advances to "Set up"

    await dialog.locator("#kb-wizard-manual-title").fill(SOURCE_TITLE);
    await dialog.locator("#kb-wizard-manual-body").fill(SOURCE_BODY);
    await dialog
      .getByRole("button", {
        name: t("Create and fetch", "Anlegen und abrufen"),
      })
      .click();
    await expect(
      dialog.getByText(tLoose("source created", "Quelle angelegt"))
    ).toBeVisible({ timeout: 60_000 });
    await dialog.getByRole("button", { name: t("Next", "Weiter") }).click();
    await dialog
      .getByRole("button", {
        name: t(
          "Finish source",
          "Quelle fertigstellen",
          "Finish and build articles",
          "Fertigstellen und Artikel erstellen"
        ),
      })
      .click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });

    // It is in the list, persisted as a manual source with its one item.
    await expect(page.getByText(SOURCE_TITLE).first()).toBeVisible({
      timeout: 30_000,
    });
    const sources = rows(
      await get(
        `/api/kb/sources?kb_id=${kbId}&search=${encodeURIComponent(SOURCE_TITLE)}`
      )
    );
    const source = sources.find((s) => s.name === SOURCE_TITLE);
    expect(source, "manual source listed for the space KB").toBeTruthy();
    expect(source?.adapter_id).toBe("manual");
    const items = rows(await get(`/api/kb/sources/${source?.id}/items`));
    expect(items.length).toBeGreaterThan(0);
  });
});
