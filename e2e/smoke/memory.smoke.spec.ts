import { expect, type Page, test } from "@playwright/test";
import { apiAccessToken, gotoLoggedIn, t } from "../helpers";

/**
 * Memory entries, UI → API → DB:
 *
 *   1. a fact added in a Space's settings (Memory) is listed for that Space;
 *   2. the same fact is NOT listed for another Space;
 *   3. a person's own (`user`) fact is listed for them and removable;
 *   4. a Space's working memory field set in its settings is returned for it and
 *      replaced, not added to, by a new value.
 *
 * What an agent is shown is decided by the same keys (memory-scopes.ts, unit
 * tested); this proves the store, the routes and the settings section agree on them.
 */

const TAG = Date.now().toString(36);
const SPACE_FACT = `E2E space fact ${TAG}`;
const USER_FACT = `E2E user fact ${TAG}`;

interface EntryList {
  entries: { body: string; id: string }[];
  working: { state: Record<string, string> };
}

async function api(page: Page) {
  const token = await apiAccessToken(page);
  const headers = { authorization: `Bearer ${token}` };
  return {
    del: async (url: string) => {
      const res = await page.request.delete(url, { headers });
      expect(res.ok(), `DELETE ${url} → ${res.status()}`).toBeTruthy();
    },
    get: async <T>(url: string): Promise<T> => {
      const res = await page.request.get(url, { headers });
      expect(res.ok(), `GET ${url} → ${res.status()}`).toBeTruthy();
      return (await res.json()) as T;
    },
    patch: async (url: string, body: unknown) => {
      const res = await page.request.patch(url, { data: body, headers });
      expect(res.ok(), `PATCH ${url} → ${res.status()}`).toBeTruthy();
    },
    post: async (url: string, body: unknown) => {
      const res = await page.request.post(url, { data: body, headers });
      expect(res.status(), `POST ${url}`).toBe(201);
    },
  };
}

function spaceRows(json: unknown): { id: string; key: string }[] {
  if (Array.isArray(json)) {
    return json as { id: string; key: string }[];
  }
  const data = (json as { data?: unknown })?.data;
  return data === undefined || data === null ? [] : spaceRows(data);
}

test.describe("memory entries", () => {
  test("a Space fact stays in its Space; a person's fact is theirs", async ({
    page,
  }) => {
    await gotoLoggedIn(page, "/");
    const client = await api(page);
    const [home, other] = spaceRows(await client.get("/api/spaces"));
    expect(home, "a Space").toBeTruthy();
    expect(other, "a second Space").toBeTruthy();
    await page.goto(`/s/${home?.key}/settings`);

    await page
      .getByRole("textbox", {
        name: t("One fact, one sentence", "Ein Fakt, ein Satz"),
      })
      .fill(SPACE_FACT);
    await page.keyboard.press("Enter");
    await expect(page.getByText(SPACE_FACT)).toBeVisible();

    const inHome = await client.get<EntryList>(
      `/ai/v1/memory/entries?scope=space&space_id=${home?.id}`
    );
    const added = inHome.entries.find((entry) => entry.body === SPACE_FACT);
    expect(added, "listed for its Space").toBeTruthy();

    const inOther = await client.get<EntryList>(
      `/ai/v1/memory/entries?scope=space&space_id=${other?.id}`
    );
    expect(inOther.entries.map((entry) => entry.body)).not.toContain(
      SPACE_FACT
    );

    const focusLabel = t("Edit Current focus", "Aktueller Fokus bearbeiten");
    await page.getByRole("button", { name: focusLabel }).click();
    await page.getByRole("textbox", { name: focusLabel }).fill(SPACE_FACT);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: focusLabel })).toHaveText(
      SPACE_FACT
    );
    const spaceWorking = `/ai/v1/memory/entries?scope=space&space_id=${home?.id}`;
    await client.patch(
      `/ai/v1/memory/working?scope=space&space_id=${home?.id}`,
      { fields: { current_focus: `${SPACE_FACT} (next)` } }
    );
    const replaced = await client.get<EntryList>(spaceWorking);
    expect(replaced.working.state.current_focus).toBe(`${SPACE_FACT} (next)`);
    await client.patch(
      `/ai/v1/memory/working?scope=space&space_id=${home?.id}`,
      { fields: { current_focus: null } }
    );

    await client.post("/ai/v1/memory/entries?scope=user", { body: USER_FACT });
    const mine = await client.get<EntryList>(
      "/ai/v1/memory/entries?scope=user"
    );
    const own = mine.entries.find((entry) => entry.body === USER_FACT);
    expect(own, "listed for its person").toBeTruthy();

    await client.del(`/ai/v1/memory/entries/${own?.id}?scope=user`);
    await client.del(
      `/ai/v1/memory/entries/${added?.id}?scope=space&space_id=${home?.id}`
    );
    const after = await client.get<EntryList>(
      "/ai/v1/memory/entries?scope=user"
    );
    expect(after.entries.map((entry) => entry.body)).not.toContain(USER_FACT);
  });
});
