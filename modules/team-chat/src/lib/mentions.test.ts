import { describe, expect, it } from "vitest";
import { extractMentions, memberHash } from "./mentions.js";

const USER_A = "0198f6a2-1111-7000-8000-000000000001";
const USER_B = "0198F6A2-2222-7000-8000-000000000002";

describe("extractMentions", () => {
  it("extracts user, agent, and broadcast tokens", () => {
    const text = `hey <@u:${USER_A}> ask <@agent:engenty.coordinator> — <!here>`;
    expect(extractMentions(text)).toEqual([
      { kind: "user", target_id: USER_A },
      { kind: "agent", target_id: "engenty.coordinator" },
      { kind: "here", target_id: null },
    ]);
  });

  it("normalizes user ids to lowercase and dedupes repeats", () => {
    const text = `<@u:${USER_B}> and again <@u:${USER_B.toLowerCase()}> <!channel> <!channel>`;
    expect(extractMentions(text)).toEqual([
      { kind: "user", target_id: USER_B.toLowerCase() },
      { kind: "channel", target_id: null },
    ]);
  });

  it("ignores malformed tokens and plain text", () => {
    expect(
      extractMentions("email a@b.c, <@u:nope>, <!everyone>, @agent")
    ).toEqual([]);
  });
});

describe("memberHash", () => {
  it("is order-insensitive, case-insensitive, and deduped", () => {
    const forward = memberHash([USER_A, USER_B]);
    const backward = memberHash([USER_B.toLowerCase(), USER_A, USER_A]);
    expect(forward).toBe(backward);
    expect(forward).toBe([USER_A, USER_B.toLowerCase()].sort().join(":"));
  });
});
