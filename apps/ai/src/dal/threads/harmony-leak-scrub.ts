// Harmony (gpt-oss) channel tokens leaked into plain text.
//
// A small Harmony model can emit its tool call INTO the text channel
// (`analysis…<|end|><|start|>assistant<|channel|>commentary
// to=functions.X<|message|>{…}<|call|>assistant<|channel|>final<|message|>…`);
// the serving side then gives up parsing and passes the raw string through as
// the message text. Left alone this is worse than ugly: the persisted leak
// rides the next prompt as history, the model reads its own raw channels as
// valid style, and every following turn degrades further.
//
// This scrub runs at the thread-message DAL seam — on write so new rows are
// clean, and on read so rows poisoned before the scrub existed stop feeding
// prompts and snapshots. It cannot un-fabricate what the model said inside
// the final channel; it only keeps the final channel's content and drops the
// raw markup.

const HARMONY_TOKEN_PATTERN =
  /<\|(?:start|end|call|return|constrain|channel|message)\|>/g;
const HARMONY_MARKER = "<|";
const FINAL_CHANNEL_MARKER = "final<|message|>";
/**
 * The fully degraded leak drops the tokens too and glues the channel header
 * into the words: `…<|end|>assistantfinalI've sent a ping…`. A glued
 * `assistantfinal` (or a text that IS a glued `analysis…` stream) never
 * occurs in real prose.
 */
const GLUED_FINAL_MARKER = "assistantfinal";
const GLUED_ANALYSIS_PATTERN = /^(?:assistant)?analysis(?=[A-Z"'{])/;

export function scrubHarmonyLeakFromText(text: string): string {
  const glued = GLUED_ANALYSIS_PATTERN.test(text);
  if (!(text.includes(HARMONY_MARKER) || glued)) {
    return text;
  }
  // Everything before the last final-channel marker is analysis/commentary —
  // reasoning and (possibly fabricated) tool traffic that was never meant to
  // render. Without any final channel, keep the text and drop only the tokens.
  const finalIndex = text.lastIndexOf(FINAL_CHANNEL_MARKER);
  if (finalIndex >= 0) {
    return text
      .slice(finalIndex + FINAL_CHANNEL_MARKER.length)
      .replace(HARMONY_TOKEN_PATTERN, "");
  }
  const gluedIndex = text.lastIndexOf(GLUED_FINAL_MARKER);
  if (gluedIndex >= 0) {
    return text
      .slice(gluedIndex + GLUED_FINAL_MARKER.length)
      .replace(HARMONY_TOKEN_PATTERN, "");
  }
  return text.replace(HARMONY_TOKEN_PATTERN, "");
}

/**
 * Scrub every text part of an assistant message's parts array. Non-text parts
 * (reasoning, tool cards, files) pass through untouched; the array is only
 * copied when something actually changes.
 */
export function scrubHarmonyLeakFromParts(parts: unknown): unknown {
  if (!Array.isArray(parts)) {
    return parts;
  }
  let changed = false;
  const next = parts.map((part) => {
    if (
      part &&
      typeof part === "object" &&
      (part as { type?: unknown }).type === "text" &&
      typeof (part as { text?: unknown }).text === "string"
    ) {
      const text = (part as { text: string }).text;
      const scrubbed = scrubHarmonyLeakFromText(text);
      if (scrubbed !== text) {
        changed = true;
        return { ...(part as object), text: scrubbed };
      }
    }
    return part;
  });
  return changed ? next : parts;
}
