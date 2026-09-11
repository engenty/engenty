import { expect, test } from "@playwright/test";
import { gotoLoggedIn, uniqueName } from "../helpers";
import { scenarioClient, waitForOutcome } from "./harness";

// UC-10 Daily Digest — T3 scenario eval (spec: docs/wip/use-cases/UC-10-daily-digest.md).
//
// Seeds stamped fixtures through the operations door, creates the digest
// routine (a standing task with a schedule wake source), fires it now, and
// grades the message that lands in the channel by exact string containment —
// deterministic, no LLM judge. Runs a REAL model, so it is env-gated exactly
// like copilot.smoke.spec.ts and never part of the default nightly.
//
// Requirements: dev stack up, AI gateway key, a `smoke-e2e` team-chat channel.

const DIGEST_AGENT = process.env.UC10_AGENT_KEY ?? "tasks.assist";
const CHANNEL_NAME = process.env.UC10_CHANNEL ?? "smoke-e2e";

test("UC-10: daily digest routine posts a grounded digest to team-chat", async ({
  page,
}) => {
  test.skip(
    process.env.ENGENTY_SMOKE_LLM !== "1",
    "LLM scenario disabled (set ENGENTY_SMOKE_LLM=1 to enable)"
  );
  test.setTimeout(420_000);

  await gotoLoggedIn(page);
  const api = await scenarioClient(page);
  const stamp = uniqueName("uc10");

  // ── Fixtures (all graded by exact name) ────────────────────────────────
  const offerName = `UC10 Offer ${stamp}`;
  const taskAName = `UC10 Task A ${stamp}`;
  const taskBName = `UC10 Task B ${stamp}`;
  const contactFirst = "UC10Contact";
  const contactLast = stamp;

  const cleanup: Array<() => Promise<unknown>> = [];
  let routineId: string | null = null;

  try {
    const offer = await api.invokeOperation("offers_create", {
      title: offerName,
    });
    if (offer?.id) {
      cleanup.push(() =>
        api.invokeOperation("offers_delete", { id: offer.id })
      );
    }

    for (const title of [taskAName, taskBName]) {
      const created = await api.invokeOperation("tasks_create", { title });
      if (created?.id) {
        cleanup.push(() =>
          api.invokeOperation("tasks_delete", { id: created.id })
        );
      }
    }

    const contact = await api.invokeOperation("contacts_create", {
      first_name: contactFirst,
      last_name: contactLast,
      type: "person",
    });
    if (contact?.id) {
      cleanup.push(() =>
        api.invokeOperation("contacts_delete", { id: contact.id })
      );
    }

    // ── Target channel ─────────────────────────────────────────────────
    const conversations = await api.invokeOperation(
      "team_chat_conversations_list",
      {
        include_public: true,
      }
    );
    const channels: Array<{ id: string; name?: string }> = Array.isArray(
      conversations
    )
      ? conversations
      : (conversations?.conversations ?? conversations?.channels ?? []);
    const channel = channels.find((c) => c.name === CHANNEL_NAME);
    if (!channel) {
      throw new Error(
        `team-chat channel "${CHANNEL_NAME}" must exist in the dev tenant`
      );
    }

    // ── The routine: standing task + schedule wake source ──────────────
    const trigger = await api.createRoutine({
      approval_grants: ["team_chat_post_as_agent"],
      cron: "0 7 * * 1-5",
      kind: "schedule",
      name: `UC10 Daily digest ${stamp}`,
      task: {
        agent_type_key: DIGEST_AGENT,
        instructions: [
          `Post ONE digest message to the team-chat channel "${CHANNEL_NAME}" (id: ${channel.id}).`,
          `The digest covers exactly the records whose names start with "UC10" and contain "${stamp}":`,
          "list every matching offer (offers_list), every matching open task (tasks_list),",
          "and every matching contact (contacts_list), each by its exact full name.",
          `Include the token ${stamp} in the message. Mention nothing that does not exist.`,
          "Post via team_chat_post as yourself, then finish.",
        ].join(" "),
        title: `UC10 Daily digest ${stamp}`,
      },
      timezone: "Europe/Vienna",
    });
    routineId = trigger.id;
    cleanup.push(() => api.deleteRoutine(trigger.id));

    // AC-1: creating through the product door leaves the routine schedulable.
    const listed = await api.listRoutines();
    const mine = (listed?.triggers ?? listed ?? []).find(
      (t: { id: string }) => t.id === trigger.id
    );
    expect(
      mine,
      "created routine must appear in the routines list"
    ).toBeTruthy();
    expect(
      mine.next_fire_at,
      "AC-1: routine must be scheduled (next_fire_at)"
    ).toBeTruthy();

    // ── Fire now, then grade what lands in the channel ─────────────────
    const fired = await api.runRoutineNow(trigger.id);
    expect(fired.ok).toBe(true);
    const standingTaskId: string = fired.task.id;

    const digest = await waitForOutcome(
      async () => {
        const history = await api.invokeOperation(
          "team_chat_conversations_history",
          {
            channel: channel.id,
            limit: 50,
          }
        );
        const messages: Array<{ text?: string }> = Array.isArray(history)
          ? history
          : (history?.messages ?? []);
        return messages.find((m) => m.text?.includes(stamp)) ?? null;
      },
      { label: `digest message containing "${stamp}" in #${CHANNEL_NAME}` }
    );

    // AC-5: grounded content — every fixture named, exactly.
    for (const expected of [offerName, taskAName, taskBName, contactFirst]) {
      expect(digest.text, `digest must name "${expected}"`).toContain(expected);
    }

    // AC-3: a second fire re-dispatches the SAME standing task (or reports
    // "skipped" while the first run is still winding down) — never a new task.
    const second = await api.runRoutineNow(trigger.id);
    expect(second.task.id, "AC-3: fires must share ONE standing task").toBe(
      standingTaskId
    );
  } finally {
    // Best-effort teardown; the routine goes first so nothing re-fires.
    if (routineId) {
      await api.updateRoutine(routineId, { enabled: false }).catch(() => {
        // Teardown is best-effort: a failed disable must not mask the verdict.
      });
    }
    for (const undo of cleanup.reverse()) {
      await undo().catch(() => {
        // Same: a fixture that resists deletion is not a scenario failure.
      });
    }
  }
});
