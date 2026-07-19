import { describe, expect, it } from "vitest";
import type { MentionRecord } from "../schema/types.js";
import {
  enqueueAgentMentions,
  TEAM_CHAT_AGENT_MENTION_QUEUE,
} from "./agent-mention-queue.js";

function fakeQueue() {
  const sent: { payload: Record<string, unknown>; queue: string }[] = [];
  return {
    queue: {
      read: async () => [],
      send: async (queue: string, payload: Record<string, unknown>) => {
        sent.push({ payload, queue });
        return 1;
      },
      sendBatch: async () => [],
    },
    sent,
  };
}

const base = {
  conversationId: "conv-1",
  messageTs: "1000.000001",
  tenantId: "tenant-1",
  threadTs: null,
};

describe("enqueueAgentMentions", () => {
  it("dispatches once per distinct agent, ignoring user/broadcast mentions", async () => {
    const { queue, sent } = fakeQueue();
    const mentions: MentionRecord[] = [
      { kind: "user", target_id: "u-1" },
      { kind: "agent", target_id: "engenty.coordinator" },
      { kind: "agent", target_id: "engenty.coordinator" },
      { kind: "here", target_id: null },
      { kind: "agent", target_id: "tasks.assist" },
    ];
    await enqueueAgentMentions(queue, { ...base, mentions });
    expect(sent).toHaveLength(2);
    expect(sent[0]?.queue).toBe(TEAM_CHAT_AGENT_MENTION_QUEUE);
    expect(sent.map((s) => s.payload.agent_type_key)).toEqual([
      "engenty.coordinator",
      "tasks.assist",
    ]);
    // Root posts thread under their own ts.
    expect(sent[0]?.payload.thread_ts).toBe(base.messageTs);
  });

  it("is a no-op without a queue service", async () => {
    await expect(
      enqueueAgentMentions(null, {
        ...base,
        mentions: [{ kind: "agent", target_id: "a" }],
      })
    ).resolves.toBeUndefined();
  });
});
