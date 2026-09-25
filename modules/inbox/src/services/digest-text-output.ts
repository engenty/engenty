// Plain-text answer formats for the inbox digest prompts. The fast-text model
// writes a few labelled lines instead of JSON (small models break JSON-escaped
// Markdown), and these parsers read them back tolerantly: missing sections come
// back empty, stray bullets and wrapping code fences are ignored.

/** Drop a code fence wrapping the whole answer (```text … ```). */
export function stripWrappingFence(text: string): string {
  const lines = text.trim().split("\n");
  const first = lines[0]?.trim() ?? "";
  const last = lines.at(-1)?.trim() ?? "";
  if (lines.length >= 2 && /^```[\w-]*$/.test(first) && last === "```") {
    return lines.slice(1, -1).join("\n").trim();
  }
  return text.trim();
}

const BULLET = /^\s*(?:[-*•+]|\d+[.)])\s+/;
const EMPTY_ITEM = /^\(?(?:none|n\/a|-|–|—|nothing|keine?s?|nichts)\)?\.?$/i;

/** Strip a leading list marker (`-`, `*`, `1.`). */
function cleanItem(line: string): string {
  return line.replace(BULLET, "").trim();
}

function isEmptyItem(value: string): boolean {
  return !value || EMPTY_ITEM.test(value);
}

/**
 * Match `LABEL: rest` with the label in any case, optionally bolded or as a
 * Markdown heading (`**OPEN:**`, `## Actions:`). Returns the canonical label.
 */
function matchLabel(
  line: string,
  labels: Record<string, string>
): { label: string; rest: string } | null {
  const match =
    /^\s*(?:#{1,6}\s*)?(?:\*\*|__)?([A-Za-z][A-Za-z _-]*?)(?:\*\*|__)?\s*:\s*(?:\*\*|__)?\s*(.*)$/.exec(
      line
    );
  if (!match?.[1]) {
    return null;
  }
  const label =
    labels[
      match[1]
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, " ")
    ];
  return label ? { label, rest: (match[2] ?? "").trim() } : null;
}

// ─── Message digest ─────────────────────────────────────────────────────────

export interface MessageDigestText {
  /** Raw category token (validated against the tenant allowlist by the caller). */
  category: string | null;
  content_markdown: string;
  keep_attachment_indexes: number[];
}

const MESSAGE_LABELS: Record<string, string> = {
  attachments: "attachments",
  "keep attachments": "attachments",
  category: "category",
  content: "content",
};

/**
 * Parse:
 * ```
 * CATEGORY: <slug>
 * ATTACHMENTS: 0, 2        (or "none")
 * CONTENT:
 * <cleaned body as Markdown — everything below this line>
 * ```
 * Header lines are only read above `CONTENT:`; the body is taken verbatim.
 * Without a `CONTENT:` line, whatever is not a header line is the body.
 * Returns null when there is no body at all.
 */
export function parseMessageDigestText(text: string): MessageDigestText | null {
  const lines = stripWrappingFence(text).split("\n");
  let category: string | null = null;
  let indexes: number[] = [];
  const bodyLines: string[] = [];
  let inContent = false;
  for (const line of lines) {
    if (inContent) {
      bodyLines.push(line);
      continue;
    }
    const labelled = matchLabel(line, MESSAGE_LABELS);
    if (labelled?.label === "category") {
      category =
        labelled.rest
          .replace(/[`*"'[\]]/g, "")
          .trim()
          .toLowerCase() || null;
    } else if (labelled?.label === "attachments") {
      indexes = [...labelled.rest.matchAll(/\d+/g)].map((m) => Number(m[0]));
    } else if (labelled?.label === "content") {
      inContent = true;
      if (labelled.rest) {
        bodyLines.push(labelled.rest);
      }
    } else {
      bodyLines.push(line);
    }
  }
  const content_markdown = stripWrappingFence(bodyLines.join("\n"));
  if (!content_markdown) {
    return null;
  }
  return {
    category,
    content_markdown,
    keep_attachment_indexes: [...new Set(indexes)],
  };
}

// ─── Thread summary ─────────────────────────────────────────────────────────

export interface ThreadSummaryParticipantText {
  email: string;
  name: string | null;
  role: string | null;
}

export interface ThreadSummaryText {
  headline: string;
  open_points: string[];
  participants: ThreadSummaryParticipantText[];
  suggested_actions: string[];
}

type SummarySection = "headline" | "open" | "actions" | "participants";

const SUMMARY_LABELS: Record<string, SummarySection> = {
  headline: "headline",
  open: "open",
  "open points": "open",
  actions: "actions",
  "suggested actions": "actions",
  "next actions": "actions",
  participants: "participants",
};

const EMAIL = /[^\s<>()|,;"']+@[^\s<>()|,;"']+\.[^\s<>()|,;"']+/;

function parseParticipant(line: string): ThreadSummaryParticipantText | null {
  const email = EMAIL.exec(line)?.[0];
  if (!email) {
    return null;
  }
  const parts = line.split("|").map((part) => part.trim());
  const rest = parts.filter((part) => !part.includes(email));
  const clean = (value: string | undefined) =>
    value && !isEmptyItem(value) ? value : null;
  return {
    email: email.toLowerCase(),
    name: clean(rest[0]),
    role: clean(rest[1]),
  };
}

/**
 * Parse:
 * ```
 * HEADLINE: <one sentence>
 * OPEN:
 * - <point>
 * ACTIONS:
 * - <action>
 * PARTICIPANTS:
 * - <email> | <name> | <role hint>
 * ```
 * Missing sections → empty; "none" entries are dropped; text before any label
 * becomes the headline when none was given.
 */
export function parseThreadSummaryText(text: string): ThreadSummaryText {
  const result: ThreadSummaryText = {
    headline: "",
    open_points: [],
    participants: [],
    suggested_actions: [],
  };
  let section: SummarySection | null = null;
  const addItem = (target: SummarySection, raw: string) => {
    const value = cleanItem(raw);
    if (isEmptyItem(value)) {
      return;
    }
    if (target === "headline") {
      result.headline = result.headline ? `${result.headline} ${value}` : value;
    } else if (target === "open") {
      result.open_points.push(value);
    } else if (target === "actions") {
      result.suggested_actions.push(value);
    } else {
      const participant = parseParticipant(value);
      if (participant) {
        result.participants.push(participant);
      }
    }
  };
  for (const line of stripWrappingFence(text).split("\n")) {
    if (!line.trim()) {
      continue;
    }
    const labelled = matchLabel(line, SUMMARY_LABELS);
    if (labelled) {
      section = labelled.label as SummarySection;
      addItem(section, labelled.rest);
      continue;
    }
    // Prose before the first label, or after the headline, extends the headline
    // only while it is still empty — one sentence, not a recap.
    if (section === null || section === "headline") {
      if (!result.headline) {
        addItem("headline", line);
      }
      continue;
    }
    addItem(section, line);
  }
  return result;
}
