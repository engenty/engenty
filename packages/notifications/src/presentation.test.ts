import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_TITLES,
  notificationBody,
  notificationTarget,
  renderNotificationTitle,
} from "./presentation.js";
import { presentNotification } from "./service.js";

const here = dirname(fileURLToPath(import.meta.url));

function uiTitles(locale: string): Record<string, string> {
  const file = resolve(
    here,
    `../../../apps/ui/src/locales/${locale}/common.json`
  );
  return JSON.parse(readFileSync(file, "utf8")).notifications.titles;
}

function names(template: string, pattern: RegExp): string[] {
  return [...template.matchAll(pattern)].map((m) => m[1] as string).sort();
}

describe("notification titles", () => {
  it.each([
    "en",
    "de",
  ])("the %s UI says every title with the same names", (locale) => {
    const ui = uiTitles(locale);
    expect(Object.keys(ui).sort()).toEqual(
      Object.keys(NOTIFICATION_TITLES).sort()
    );
    for (const [key, template] of Object.entries(NOTIFICATION_TITLES)) {
      expect(names(ui[key] as string, /\{\{(\w+)\}\}/g), key).toEqual(
        names(template, /\{(\w+)\}/g)
      );
    }
  });

  it("gives up on a title with a missing name instead of leaving a hole", () => {
    expect(renderNotificationTitle("task_failed", {})).toBeNull();
    expect(renderNotificationTitle("task_failed", { task: "Invoices" })).toBe(
      '"Invoices" failed'
    );
  });
});

describe("presentNotification", () => {
  const base = {
    kind: "tool_approval",
    source: "tasks",
    tenantId: "t1",
  };

  it("names the actor from the origin label, never the id", () => {
    const out = presentNotification({
      ...base,
      actor: { id: "inbox.assist", kind: "agent" },
      metadata: {
        actor_label: "Inbox Assistant",
        space_key: "ops",
        task_id: "k1",
      },
      title: { key: "tool_approval", params: { operation: "send email" } },
    });
    expect(out.summary).toBe("Inbox Assistant wants to use send email");
    expect(out.title_key).toBe("tool_approval");
    expect(out.target).toBe("/s/ops/tasks/k1");
  });

  it("falls back to the producer's summary when a name is missing", () => {
    const out = presentNotification({
      ...base,
      summary: "A task needs approval",
      title: { key: "tool_approval", params: { operation: "send email" } },
    });
    expect(out.summary).toBe("A task needs approval");
    expect(out.title_key).toBeNull();
  });

  it("keeps one short line of body", () => {
    const long = `**Result**\n${"word ".repeat(80)}`;
    expect(notificationBody(long)).toBe("Result");
    expect(
      notificationBody(`\n${"word ".repeat(80)}`)?.length
    ).toBeLessThanOrEqual(140);
  });
});

describe("notificationTarget", () => {
  const record = {
    actor_id: null,
    actor_kind: null,
    kind: "action_gate",
    subject_id: null,
    subject_type: null,
  } as const;

  it("opens a parked run on its run page in its own space", () => {
    expect(
      notificationTarget({
        ...record,
        metadata: { run_id: "r1", space_key: "ops", workflow_id: "w1" },
      })
    ).toBe("/s/ops/workflows/w1/runs/r1");
  });

  it("opens a room", () => {
    expect(
      notificationTarget({
        ...record,
        kind: "room_paused",
        metadata: { room_thread_id: "th1", space_key: "ops" },
      })
    ).toBe("/s/ops/rooms/th1");
  });

  it("opens a desk chat on the agent it belongs to", () => {
    expect(
      notificationTarget({
        ...record,
        kind: "agent_question",
        metadata: { space_key: "ops", thread_agent_id: "a1", thread_id: "th1" },
      })
    ).toBe("/s/ops/agents/a1?engagement=conversation%3Ath1");
  });

  it("opens a workflow to review on its owner's manage panel, never the admin catalog", () => {
    expect(
      notificationTarget({
        ...record,
        kind: "workflow_proposed",
        metadata: { owner_agent_id: "a1", space_key: "ops", workflow_id: "w1" },
      })
    ).toBe("/s/ops/agents/a1?panel=manage&workflow=w1");
  });

  it("opens a routine's outcome on the Engenty that ran it", () => {
    expect(
      notificationTarget({
        ...record,
        actor_id: "chief-of-staff",
        actor_kind: "agent",
        kind: "routine_outcome",
        metadata: { space_key: "ops" },
      })
    ).toBe("/s/ops/agents/chief-of-staff");
  });

  it("has nowhere to go without a space or an id", () => {
    expect(notificationTarget({ ...record, metadata: {} })).toBeNull();
  });
});
