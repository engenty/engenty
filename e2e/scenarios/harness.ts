import type { Page } from "@playwright/test";
import { apiAccessToken } from "../helpers";

// Scenario harness (T3 lane, see docs/wip/use-cases/): drives a use-case
// end-to-end through PUBLIC seams only — the operations door and the routines
// REST surface — as the logged-in principal. No imports from app internals, so
// scenarios survive refactors of the trigger/task machinery; when a public
// contract moves, this file is the single place to adapt.

/** Bearer-authenticated JSON client over the page's same-origin proxy. */
export async function scenarioClient(page: Page) {
  const token = await apiAccessToken(page);
  const headers = {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };

  async function json(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    url: string,
    body?: unknown
  ) {
    const res = await page.request.fetch(url, {
      data: body === undefined ? undefined : JSON.stringify(body),
      headers,
      method,
    });
    const text = await res.text();
    if (!res.ok()) {
      throw new Error(
        `${method} ${url} → ${res.status()}: ${text.slice(0, 500)}`
      );
    }
    return text ? JSON.parse(text) : null;
  }

  return {
    /** Invoke a module operation contract: POST /api/operations/:op/invoke. */
    invokeOperation: (
      operationId: string,
      input: Record<string, unknown> = {}
    ) => json("POST", `/api/operations/${operationId}/invoke`, { input }),

    /** Create a routine (trigger + its standing task): POST /ai/v1/triggers. */
    createRoutine: (body: Record<string, unknown>) =>
      json("POST", "/ai/v1/triggers", body).then((r) => r.trigger),

    updateRoutine: (id: string, body: Record<string, unknown>) =>
      json("PATCH", `/ai/v1/triggers/${id}`, body),

    deleteRoutine: (id: string) => json("DELETE", `/ai/v1/triggers/${id}`),

    listRoutines: () => json("GET", "/ai/v1/triggers"),

    /**
     * Fire now (bypasses quiet hours). Answers { ok, run_id, task } where
     * task.id is the routine's ONE standing task — stable across fires.
     */
    runRoutineNow: (id: string) =>
      json("POST", `/ai/v1/triggers/${id}/run`, {}),
  };
}

export type ScenarioClient = Awaited<ReturnType<typeof scenarioClient>>;

/** Poll `probe` until it returns a value, or fail with `label` after timeout. */
export async function waitForOutcome<T>(
  probe: () => Promise<T | null | undefined>,
  {
    label,
    timeoutMs = 180_000,
    intervalMs = 5000,
  }: { label: string; timeoutMs?: number; intervalMs?: number }
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const value = await probe();
      if (value !== null && value !== undefined) {
        return value;
      }
    } catch (err) {
      lastError = err; // transient — keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  const suffix = lastError
    ? ` (last error: ${String(lastError).slice(0, 300)})`
    : "";
  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for: ${label}${suffix}`
  );
}
