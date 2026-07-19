/**
 * Text mapping at the bridge boundary (design doc §2.3/§14): our stored text
 * is GFM markdown with engenty mention tokens; Slack wants mrkdwn with Slack
 * ids. Because both sides are line-oriented mini-markups the mapping is a
 * small set of regex rewrites — fenced/inline code spans are protected first
 * so their contents are never rewritten.
 */

/** Private-use sentinel: keeps freshly-rewritten bold out of the italic pass. */
const BOLD_SENTINEL = "\uE000";
const BOLD_SENTINEL_RE = /\uE000([^\uE000]+)\uE000/g;

export interface MentionMaps {
  /** Resolves a Slack user id to a display name for the @Name fallback. */
  slackUserLabel?: (slackUserId: string) => string | null;
  /** Slack user id (U…) → engenty user uuid (reverse map, inbound). */
  toEngentyUser?: Record<string, string>;
  /** engenty user uuid → Slack user id (U…); missing ids fall back to a name. */
  toSlackUser?: Record<string, string>;
  /** Resolves an engenty user uuid to a display name for the @Name fallback. */
  userLabel?: (userId: string) => string | null;
}

/** Split out code spans so structural rewrites never touch their contents. */
function mapOutsideCode(
  text: string,
  transform: (segment: string) => string
): string {
  return text
    .split(/(```[\s\S]*?```|`[^`\n]*`)/g)
    .map((segment, index) => (index % 2 === 1 ? segment : transform(segment)))
    .join("");
}

/** GFM markdown + engenty mention tokens → Slack mrkdwn. */
export function markdownToMrkdwn(text: string, maps: MentionMaps = {}): string {
  return mapOutsideCode(
    text,
    (segment) =>
      segment
        // Links first: [text](url) → <url|text> (before italic touches urls).
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "<$2|$1>")
        // Bold (**x** → *x*) via sentinel, then single-star italic → _x_.
        .replace(/\*\*([^*\n]+)\*\*/g, `${BOLD_SENTINEL}$1${BOLD_SENTINEL}`)
        .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1_$2_")
        .replace(BOLD_SENTINEL_RE, "*$1*")
        .replace(/~~([^~\n]+)~~/g, "~$1~")
        // Mention tokens.
        .replace(/<@u:([0-9a-fA-F-]{36})>/g, (_all, userId: string) => {
          const slackId = maps.toSlackUser?.[userId.toLowerCase()];
          if (slackId) {
            return `<@${slackId}>`;
          }
          const label = maps.userLabel?.(userId.toLowerCase());
          return label ? `@${label}` : "@user";
        })
        .replace(/<@agent:([a-z0-9][a-z0-9._-]*)>/g, "@$1")
    // <!here>/<!channel> are valid mrkdwn as-is.
  );
}

/** Slack mrkdwn → GFM markdown + engenty mention tokens. */
export function mrkdwnToMarkdown(text: string, maps: MentionMaps = {}): string {
  return mapOutsideCode(text, (segment) =>
    segment
      // Mentions first (their angle syntax collides with link unwrapping).
      .replace(/<@([A-Z0-9]+)(?:\|[^>]*)?>/g, (_all, slackId: string) => {
        const engentyId = maps.toEngentyUser?.[slackId];
        if (engentyId) {
          return `<@u:${engentyId}>`;
        }
        const label = maps.slackUserLabel?.(slackId);
        return label ? `@${label}` : "@user";
      })
      .replace(/<!(here|channel)(?:\|[^>]*)?>/g, "<!$1>")
      // Links: <url|text> → [text](url); bare <url> → url.
      .replace(/<(https?:\/\/[^>|]+)\|([^>]+)>/g, "[$2]($1)")
      .replace(/<(https?:\/\/[^>|]+)>/g, "$1")
      // Bold single-star → double-star via sentinel, then _x_ → *x*.
      .replace(
        /(^|[^*])\*([^*\n]+)\*(?!\*)/g,
        `$1${BOLD_SENTINEL}$2${BOLD_SENTINEL}`
      )
      .replace(/(^|[^_\w])_([^_\n]+)_(?![\w_])/g, "$1*$2*")
      .replace(BOLD_SENTINEL_RE, "**$1**")
      .replace(/(^|[^~])~([^~\n]+)~(?!~)/g, "$1~~$2~~")
      // Slack HTML entities.
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
  );
}
