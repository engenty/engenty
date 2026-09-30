import { describe, expect, it } from "vitest";
import type { NotificationDto } from "./api.js";
import {
  canMarkSeen,
  groupAttentionByAgent,
  groupIntoStacks,
  isAttention,
  isDismissible,
  isError,
  matchesLaneFilter,
} from "./classification.js";
import { readableActorLabel } from "./notification-face.js";

function dto(
  overrides: Partial<NotificationDto> & Pick<NotificationDto, "kind">
): NotificationDto {
  return {
    actor_id: null,
    actor_kind: null,
    attachments: [],
    audience_id: null,
    audience_kind: "space",
    body: null,
    class: "update",
    coalesce_key: null,
    coalesced_count: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    dedupe_key: null,
    dismissed_at: null,
    id: "n1",
    metadata: null,
    payload: null,
    priority: "medium",
    resolved_at: null,
    seen: false,
    source: "test",
    space_id: "s1",
    status: "pending",
    subject_id: null,
    subject_type: null,
    summary: "x",
    target: null,
    tenant_id: "t1",
    title_key: null,
    title_params: null,
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("isAttention", () => {
  it("takes high and urgent updates, not medium ones", () => {
    expect(
      isAttention(dto({ kind: "agent_desk_post", priority: "medium" }))
    ).toBe(false);
    expect(
      isAttention(dto({ kind: "agent_desk_post", priority: "high" }))
    ).toBe(true);
    expect(
      isAttention(dto({ kind: "agent_desk_post", priority: "urgent" }))
    ).toBe(true);
  });

  it("keeps a decision or todo until handled, an alert or FYI until seen", () => {
    expect(
      isAttention(dto({ class: "decision", kind: "tool_approval", seen: true }))
    ).toBe(true);
    expect(
      isAttention(dto({ class: "todo", kind: "task_assigned", seen: true }))
    ).toBe(true);
    expect(isAttention(dto({ class: "alert", kind: "task_failed" }))).toBe(
      true
    );
    expect(
      isAttention(dto({ class: "alert", kind: "task_failed", seen: true }))
    ).toBe(false);
    expect(
      isAttention(
        dto({ kind: "agent_desk_post", priority: "high", seen: true })
      )
    ).toBe(false);
  });

  it("drops resolved and dismissed rows", () => {
    expect(
      isAttention(
        dto({ class: "decision", kind: "tool_approval", status: "resolved" })
      )
    ).toBe(false);
    expect(
      isAttention(
        dto({
          kind: "agent_desk_post",
          priority: "urgent",
          status: "dismissed",
        })
      )
    ).toBe(false);
  });
});

describe("matchesLaneFilter", () => {
  it("lists a high-priority update under Notifications only, never twice or under errors", () => {
    const highUpdate = dto({
      kind: "agent_desk_post",
      priority: "urgent",
    });
    expect(matchesLaneFilter(highUpdate, "updates")).toBe(false);
    expect(matchesLaneFilter(highUpdate, "attention")).toBe(true);
    expect(matchesLaneFilter(highUpdate, "errors")).toBe(false);
    expect(matchesLaneFilter(highUpdate, "hitl")).toBe(false);
    expect(isError(highUpdate)).toBe(false);
  });

  it("mixes decisions, todos and alerts into Wichtig, never plain updates", () => {
    expect(
      matchesLaneFilter(
        dto({ class: "decision", kind: "tool_approval" }),
        "attention"
      )
    ).toBe(true);
    expect(
      matchesLaneFilter(
        dto({ class: "todo", kind: "task_assigned" }),
        "attention"
      )
    ).toBe(true);
    expect(
      matchesLaneFilter(
        dto({ class: "alert", kind: "task_failed" }),
        "attention"
      )
    ).toBe(true);
    expect(
      matchesLaneFilter(dto({ kind: "task_completed" }), "attention")
    ).toBe(false);
  });
});

describe("isDismissible", () => {
  it("clears alerts and attention FYIs, never decisions or todos", () => {
    expect(isDismissible(dto({ class: "alert", kind: "task_failed" }))).toBe(
      true
    );
    expect(
      isDismissible(dto({ kind: "agent_desk_post", priority: "high" }))
    ).toBe(true);
    expect(isDismissible(dto({ kind: "task_completed" }))).toBe(false);
    expect(
      isDismissible(dto({ class: "decision", kind: "tool_approval" }))
    ).toBe(false);
    expect(isDismissible(dto({ class: "todo", kind: "task_assigned" }))).toBe(
      false
    );
  });
});

describe("groupAttentionByAgent", () => {
  it("groups open attention rows by their agent actor, in list order", () => {
    const rows = [
      dto({
        actor_id: "a1",
        actor_kind: "agent",
        class: "decision",
        id: "n1",
        kind: "tool_approval",
      }),
      dto({
        actor_id: "a2",
        actor_kind: "agent",
        id: "n2",
        kind: "routine_outcome",
        priority: "high",
      }),
      dto({
        actor_id: "a1",
        actor_kind: "agent",
        class: "alert",
        id: "n3",
        kind: "routine_failed",
      }),
      // Not attention: a plain FYI from a1.
      dto({
        actor_id: "a1",
        actor_kind: "agent",
        id: "n4",
        kind: "task_completed",
      }),
      // A person, not an agent.
      dto({
        actor_id: "u1",
        actor_kind: "user",
        class: "todo",
        id: "n5",
        kind: "task_assigned",
      }),
    ];
    const byAgent = groupAttentionByAgent(rows);
    expect([...byAgent.keys()]).toEqual(["a1", "a2"]);
    expect(byAgent.get("a1")?.map((n) => n.id)).toEqual(["n1", "n3"]);
    expect(byAgent.get("a2")?.map((n) => n.id)).toEqual(["n2"]);
    expect(byAgent.has("u1")).toBe(false);
  });
});

describe("groupIntoStacks", () => {
  it("stacks by agent within a space, newest stack first, a record without an actor by kind", () => {
    const rows = [
      dto({
        actor_id: "a1",
        actor_kind: "agent",
        id: "n1",
        kind: "agent_desk_post",
      }),
      dto({
        actor_id: "a2",
        actor_kind: "agent",
        id: "n2",
        kind: "routine_outcome",
      }),
      dto({
        actor_id: "a1",
        actor_kind: "agent",
        id: "n3",
        kind: "routine_outcome",
      }),
      dto({
        actor_id: "a1",
        actor_kind: "agent",
        id: "n4",
        kind: "agent_desk_post",
        space_id: "s2",
      }),
      dto({ id: "n5", kind: "records_written" }),
    ];
    expect(
      groupIntoStacks(rows).map((stack) => stack.items.map((n) => n.id))
    ).toEqual([["n1", "n3"], ["n2"], ["n4"], ["n5"]]);
  });
});

describe("canMarkSeen", () => {
  it("marks an unseen alert or update seen, never a decision or a row already seen", () => {
    expect(canMarkSeen(dto({ class: "decision", kind: "tool_approval" }))).toBe(
      false
    );
    expect(canMarkSeen(dto({ class: "alert", kind: "task_failed" }))).toBe(
      true
    );
    expect(canMarkSeen(dto({ kind: "task_completed" }))).toBe(true);
    expect(canMarkSeen(dto({ kind: "task_completed", seen: true }))).toBe(
      false
    );
  });
});

describe("readableActorLabel", () => {
  it("says an agent key as words and leaves a real name alone", () => {
    expect(readableActorLabel("offers.manager")).toBe("Offers Manager");
    expect(readableActorLabel("Angebots-Assistent")).toBe("Angebots-Assistent");
    expect(readableActorLabel("Matthias Platzer")).toBe("Matthias Platzer");
  });
});
