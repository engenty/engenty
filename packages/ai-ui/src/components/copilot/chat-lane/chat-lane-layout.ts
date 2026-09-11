/**
 * The one reading column every chat lane draws in.
 *
 * A "lane" is a chat that owns its page: the full-page copilot chat, the space
 * home landing, and a specialist's desk. They are the same surface with
 * different agents behind them, so their transcript and composer must line up
 * on the same measure — a lane that spans the whole viewport reads as a
 * different product, not a wider one.
 *
 * These are the widths, not a theme: anything lane-shaped imports them instead
 * of repeating `max-w-[42rem]`, which is exactly how the specialist desk
 * drifted to full width in the first place.
 */
export const CHAT_LANE_COLUMN_CLASS = "mx-auto w-full max-w-[42rem]";

/** Composer wrapper — same measure as the transcript above it. */
export const CHAT_LANE_COMPOSER_CLASS = CHAT_LANE_COLUMN_CLASS;

/** Transcript column; the gap is the message rhythm, not a lane property. */
export const CHAT_LANE_TRANSCRIPT_CLASS = `${CHAT_LANE_COLUMN_CLASS} gap-4`;
