import type { MentionRecord } from "../schema/types.js";

/**
 * Mention tokens in message text (doc §8.1). Slack-compatible angle syntax
 * with engenty-native ids:
 *   <@u:USER_UUID>       user mention
 *   <@agent:TYPE_KEY>    agent mention
 *   <!here> / <!channel> broadcast
 * A future Slack bridge folds these to plain `<@U…>` / keeps `<!here>` as-is.
 */
const MENTION_TOKEN =
  /<@u:([0-9a-fA-F-]{36})>|<@agent:([a-z0-9][a-z0-9._-]*)>|<!(here|channel)>/g;

export function extractMentions(text: string): MentionRecord[] {
  const seen = new Set<string>();
  const mentions: MentionRecord[] = [];
  for (const match of text.matchAll(MENTION_TOKEN)) {
    const [, userId, agentKey, broadcast] = match;
    const record: MentionRecord = userId
      ? { kind: "user", target_id: userId.toLowerCase() }
      : agentKey
        ? { kind: "agent", target_id: agentKey }
        : { kind: broadcast as "channel" | "here", target_id: null };
    const key = `${record.kind}:${record.target_id ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      mentions.push(record);
    }
  }
  return mentions;
}

/**
 * Canonical member-set hash for im/mpim find-or-create (doc §4.1): sorted,
 * deduped principal ids. Plain join (not a digest) — readable in the DB and
 * bounded by the 8-peer cap on conversations.open.
 */
export function memberHash(userIds: readonly string[]): string {
  return [...new Set(userIds.map((id) => id.toLowerCase()))].sort().join(":");
}
