import { describe, expect, it } from "vitest";
import type { TeamChatMessage } from "../../src/schema/types.js";
import {
  authorColorClass,
  mentionTokensToPlainText,
  renderMentionTokens,
  sameGroup,
} from "./format.js";

const USER = "0198f6a2-1111-7000-8000-000000000001";
const users = new Map([[USER, { display_name: "Ada L", id: USER }]]);

function message(overrides: Partial<TeamChatMessage>): TeamChatMessage {
  return {
    agent_type_key: null,
    attachments: [],
    blocks: [],
    bot_id: null,
    conversation_id: "c",
    created_at: "",
    deleted: false,
    edited: null,
    files: [],
    latest_reply: null,
    metadata: {},
    reactions: [],
    reply_count: 0,
    reply_users: [],
    subtype: null,
    text: "",
    thread_ts: null,
    ts: "1000.000000",
    updated_at: "",
    user_id: USER,
    ...overrides,
  };
}

describe("mention rendering", () => {
  it("emits fragment mention links with resolved names", () => {
    expect(renderMentionTokens(`hi <@u:${USER}>`, users)).toBe(
      `hi [@Ada L](#mention:user:${USER})`
    );
    expect(renderMentionTokens("<@agent:tasks.assist> <!here>", users)).toBe(
      "[@tasks.assist](#mention:agent:tasks.assist) [@here](#mention:broadcast:here)"
    );
  });

  it("renders plain-text previews", () => {
    expect(mentionTokensToPlainText(`hi <@u:${USER}> <!channel>`, users)).toBe(
      "hi @Ada L @channel"
    );
  });
});

describe("authorColorClass", () => {
  it("is deterministic per author", () => {
    expect(authorColorClass(USER)).toBe(authorColorClass(USER));
    expect(authorColorClass(USER)).toMatch(/^text-/);
  });
});

describe("sameGroup", () => {
  it("groups consecutive same-author messages within the window", () => {
    const a = message({ ts: "1000.000000" });
    const b = message({ ts: "1100.000000" });
    expect(sameGroup(a, b)).toBe(true);
    expect(sameGroup(a, message({ ts: "2000.000000" }))).toBe(false);
    expect(
      sameGroup(a, message({ ts: "1100.000000", user_id: "someone-else" }))
    ).toBe(false);
    expect(
      sameGroup(a, message({ subtype: "activity", ts: "1100.000000" }))
    ).toBe(false);
  });
});
