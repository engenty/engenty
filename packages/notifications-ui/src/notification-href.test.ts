import { describe, expect, it } from "vitest";
import type { NotificationDto } from "./api.js";
import { notificationHref } from "./notification-href.js";

function dto(
  overrides: Partial<NotificationDto> & Pick<NotificationDto, "kind">
): NotificationDto {
  return {
    actor_id: null,
    actor_kind: null,
    audience_id: null,
    audience_kind: "tenant",
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
    space_id: null,
    status: "pending",
    subject_id: null,
    subject_type: null,
    summary: "x",
    tenant_id: "t1",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("notificationHref", () => {
  it("opens a workflow on the catalog page, not the retired /flows segment", () => {
    expect(
      notificationHref(
        dto({
          kind: "workflow_proposed",
          metadata: { workflow_id: "01a0a5d1-a5ea-75a7-98ee-02a80c6397c3" },
        })
      )
    ).toBe("/admin/engenty/workflows/01a0a5d1-a5ea-75a7-98ee-02a80c6397c3");
  });

  it("rewrites a stored payload route that still uses /flows", () => {
    expect(
      notificationHref(
        dto({
          kind: "workflow_proposed",
          payload: {
            route: "/admin/engenty/flows/01a0a5d1-a5ea-75a7-98ee-02a80c6397c3",
          },
        })
      )
    ).toBe("/admin/engenty/workflows/01a0a5d1-a5ea-75a7-98ee-02a80c6397c3");
  });

  it("leaves a team-chat payload route alone", () => {
    expect(
      notificationHref(
        dto({
          kind: "team_chat.message",
          payload: { route: "/mdl/team-chat/conv-1?ts=2" },
        })
      )
    ).toBe("/mdl/team-chat/conv-1?ts=2");
  });
});
