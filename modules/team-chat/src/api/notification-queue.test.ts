import { describe, expect, it } from "vitest";
import type { ConversationMember } from "../schema/types.js";
import {
  computeMessageNotificationTargets,
  notificationPreview,
} from "./notification-queue.js";

function member(
  overrides: Partial<ConversationMember> & { principal_id: string }
): ConversationMember {
  return {
    conversation_id: "conv-1",
    created_at: "2026-07-19T00:00:00Z",
    id: `m-${overrides.principal_id}`,
    last_read_ts: null,
    muted: false,
    notify_prefs: {},
    principal_type: "user",
    role: "member",
    ...overrides,
  };
}

describe("computeMessageNotificationTargets", () => {
  it("channel default notifies mentioned users only, never the author", () => {
    const targets = computeMessageNotificationTargets({
      authorUserId: "u-author",
      conversationType: "public_channel",
      members: [
        member({ principal_id: "u-author" }),
        member({ principal_id: "u-mentioned" }),
        member({ principal_id: "u-bystander" }),
      ],
      mentions: [{ kind: "user", target_id: "u-mentioned" }],
    });
    expect(targets).toEqual([{ reason: "mention", user_id: "u-mentioned" }]);
  });

  it("DMs notify every other member; muted and level=nothing silence", () => {
    const targets = computeMessageNotificationTargets({
      authorUserId: "u-author",
      conversationType: "im",
      members: [
        member({ principal_id: "u-author" }),
        member({ principal_id: "u-peer" }),
        member({ muted: true, principal_id: "u-muted" }),
        member({
          notify_prefs: { level: "nothing" },
          principal_id: "u-silenced",
        }),
      ],
      mentions: [],
    });
    expect(targets).toEqual([{ reason: "dm", user_id: "u-peer" }]);
  });

  it("@here counts as a mention; level=all opts into channel activity", () => {
    const targets = computeMessageNotificationTargets({
      authorUserId: "u-author",
      conversationType: "public_channel",
      members: [
        member({ principal_id: "u-a" }),
        member({ muted: true, principal_id: "u-muted" }),
      ],
      mentions: [{ kind: "here", target_id: null }],
    });
    expect(targets).toEqual([{ reason: "mention", user_id: "u-a" }]);

    const activity = computeMessageNotificationTargets({
      authorUserId: "u-author",
      conversationType: "public_channel",
      members: [
        member({ notify_prefs: { level: "all" }, principal_id: "u-all" }),
        member({ principal_id: "u-default" }),
      ],
      mentions: [],
    });
    expect(activity).toEqual([{ reason: "activity", user_id: "u-all" }]);
  });

  it("thread replies notify participants; agents are never targets", () => {
    const targets = computeMessageNotificationTargets({
      authorUserId: null,
      conversationType: "public_channel",
      members: [
        member({ principal_id: "u-root-author" }),
        member({ principal_id: "u-bystander" }),
        member({
          principal_id: "engenty.coordinator",
          principal_type: "agent",
        }),
      ],
      mentions: [],
      threadParticipants: ["u-root-author", "engenty.coordinator"],
    });
    expect(targets).toEqual([{ reason: "thread", user_id: "u-root-author" }]);
  });
});

describe("notificationPreview", () => {
  it("folds mention tokens and collapses whitespace", () => {
    expect(
      notificationPreview(
        "hey <@u:0f0e0d0c-0b0a-0908-0706-050403020100>\n see <@agent:engenty.coordinator> <!channel>"
      )
    ).toBe("hey @user see @engenty.coordinator @channel");
  });
});
