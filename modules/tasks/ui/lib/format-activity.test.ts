import { describe, expect, it } from "vitest";
import type { TaskActivity } from "../../src/schema/types.js";
import {
  buildActivityMessage,
  getInitials,
  hasExpandableActivityPayload,
  resolveActivityActor,
  resolveTaskCommentAudience,
  truncateCommentPreview,
} from "./format-activity.js";

function activity(
  overrides: Partial<TaskActivity> & Pick<TaskActivity, "event_type">
): TaskActivity {
  return {
    actor_agent_type_key: null,
    actor_user_id: null,
    created_at: "2026-05-22T12:00:00.000Z",
    id: "act-1",
    payload: {},
    scope_id: "scope",
    task_id: "task-1",
    tenant_id: "tenant",
    ...overrides,
  };
}

const t = (key: string, options?: Record<string, unknown>) => {
  if (options) {
    return `${key}:${JSON.stringify(options)}`;
  }
  return key;
};

describe("format-activity helpers", () => {
  it("derives initials from names", () => {
    expect(getInitials("Marc Example")).toBe("ME");
  });

  it("resolves user actor from profiles", () => {
    const profiles = new Map([
      ["user-1", { id: "user-1", full_name: "Marc Example" }],
    ]);
    const actor = resolveActivityActor(
      activity({ event_type: "tasks.status_changed", actor_user_id: "user-1" }),
      profiles,
      t
    );
    expect(actor.kind).toBe("user");
    expect(actor.label).toBe("Marc Example");
    expect(actor.initials).toBe("ME");
  });

  it("falls back to unknown actor label when user not in profiles map", () => {
    const actor = resolveActivityActor(
      activity({
        event_type: "tasks.status_changed",
        actor_user_id: "e9513d09-0000-0000-0000-000000000000",
      }),
      new Map(),
      t
    );
    expect(actor.kind).toBe("user");
    expect(actor.label).toBe("detail.activityUnknownActor");
    expect(actor.label).not.toMatch(/^e9513d09/);
  });

  it("falls back to unknown actor label when profiles map is undefined", () => {
    const actor = resolveActivityActor(
      activity({
        event_type: "tasks.status_changed",
        actor_user_id: "e9513d09-0000-0000-0000-000000000000",
      }),
      undefined,
      t
    );
    expect(actor.kind).toBe("user");
    expect(actor.label).toBe("detail.activityUnknownActor");
  });

  it("prefers agent attribution when both agent key and user id are present", () => {
    const profiles = new Map([
      ["user-1", { id: "user-1", full_name: "Matthias Platzer" }],
    ]);
    const actor = resolveActivityActor(
      activity({
        event_type: "tasks.comment_added",
        actor_agent_type_key: "tasks.assist",
        actor_user_id: "user-1",
      }),
      profiles,
      t
    );
    expect(actor.kind).toBe("agent");
    expect(actor.label).toBe("Tasks Assist");
    expect(actor.label).not.toBe("Matthias Platzer");
  });

  it("builds status changed message labels", () => {
    const message = buildActivityMessage(
      activity({
        event_type: "tasks.status_changed",
        payload: { from: "backlog", to: "in_progress" },
      }),
      {
        statusDefinitions: [
          { id: "backlog", label: "Backlog", color: "slate" },
          { id: "in_progress", label: "In progress", color: "blue" },
        ],
        t,
      }
    );
    expect(message.kind).toBe("status_changed");
    expect(message.textValues).toEqual({
      from: "Backlog",
      to: "In progress",
    });
  });

  it("hides payload expander for simple status changes", () => {
    expect(
      hasExpandableActivityPayload(
        activity({
          event_type: "tasks.status_changed",
          payload: { from: "backlog", to: "in_progress" },
        })
      )
    ).toBe(false);
  });

  it("shows payload expander when extra fields exist", () => {
    expect(
      hasExpandableActivityPayload(
        activity({
          event_type: "tasks.checked_out",
          payload: { run_id: "run-1", agent_type_key: "tasks-assist" },
        })
      )
    ).toBe(true);
  });

  it("truncates long comment previews on one line", () => {
    const long = `${"word ".repeat(20).trim()} extra`;
    expect(truncateCommentPreview(long)).toMatch(/…$/);
    expect(truncateCommentPreview(long).length).toBeLessThanOrEqual(48);
    expect(truncateCommentPreview("short comment")).toBe("short comment");
    expect(truncateCommentPreview("line one\nline two")).toBe(
      "line one line two"
    );
  });

  it("builds comment added message with preview", () => {
    const message = buildActivityMessage(
      activity({
        event_type: "tasks.comment_added",
        payload: { comment_id: "c-1", content: "Hello team" },
      }),
      { t }
    );
    expect(message.kind).toBe("comment_added");
    expect(message.commentPreview).toBe("Hello team");
    expect(message.textKey).toBe("detail.activityActorCommentAdded");
  });

  it("classifies comment audience against task membership", () => {
    const task = {
      collaborator_user_ids: ["collab-1"],
      created_by_user_id: "creator-1",
      primary_assignee_user_id: "assignee-1",
    };
    expect(
      resolveTaskCommentAudience(task, {
        created_by_agent_type_key: "tasks-assist",
        created_by_user_id: null,
      })
    ).toBe("agent");
    expect(
      resolveTaskCommentAudience(task, {
        created_by_agent_type_key: null,
        created_by_user_id: "assignee-1",
      })
    ).toBe("team");
    expect(
      resolveTaskCommentAudience(task, {
        created_by_agent_type_key: null,
        created_by_user_id: "stranger-1",
      })
    ).toBe("outside");
  });
});
