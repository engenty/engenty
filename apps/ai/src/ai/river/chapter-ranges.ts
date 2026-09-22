// Where the river is cut, on the calendar.
//
// A chapter is a stretch of the person's one copilot conversation. Two of the
// three kinds are cut without asking: one per local calendar day, one per ISO
// week (Monday to Monday), each covering only what came after the previous
// chapter of its kind. The cut is decided here, from dates alone, so it can be
// tested without a database and reasoned about without a model.
//
// Local means the PERSON's day, not the server's: "last Tuesday" is asked in
// the time zone the person lives in. The zone is an input; the default is
// the process zone, which a deployment sets deliberately or leaves at UTC.

import type { ThreadCompactionKind } from "../../dal/threads/types.js";

export interface ChapterRange {
  end: Date;
  kind: Extract<ThreadCompactionKind, "daily" | "weekly">;
  start: Date;
}

const DAY_MS = 86_400_000;
/** Older gaps fold into the first chapter rather than into one per day. */
const MAX_LOOKBACK_DAYS = 90;

const partsCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = partsCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
      minute: "2-digit",
      month: "2-digit",
      second: "2-digit",
      timeZone,
      weekday: "short",
      year: "numeric",
    });
    partsCache.set(timeZone, formatter);
  }
  return formatter;
}

interface LocalParts {
  day: number;
  hour: number;
  minute: number;
  month: number;
  second: number;
  weekday: number;
  year: number;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function localParts(date: Date, timeZone: string): LocalParts {
  const parts: Record<string, string> = {};
  for (const part of formatterFor(timeZone).formatToParts(date)) {
    parts[part.type] = part.value;
  }
  return {
    day: Number(parts.day),
    // `hour12: false` still yields "24" at midnight in some engines.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    month: Number(parts.month),
    second: Number(parts.second),
    weekday: WEEKDAYS.indexOf(parts.weekday ?? ""),
    year: Number(parts.year),
  };
}

/** The zone's offset from UTC at `date`, in ms (positive east of Greenwich). */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const local = localParts(date, timeZone);
  const asUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second
  );
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Midnight at the start of `date`'s local day, as an instant. */
export function startOfLocalDay(date: Date, timeZone: string): Date {
  const local = localParts(date, timeZone);
  const midnightAsUtc = Date.UTC(local.year, local.month - 1, local.day);
  // The offset at midnight may differ from the one at `date` (a DST change
  // during the day), so read it at the first guess and correct once.
  const guess = new Date(midnightAsUtc - zoneOffsetMs(date, timeZone));
  return new Date(midnightAsUtc - zoneOffsetMs(guess, timeZone));
}

/** Midnight at the start of the local ISO week (Monday) holding `date`. */
export function startOfLocalWeek(date: Date, timeZone: string): Date {
  const dayStart = startOfLocalDay(date, timeZone);
  const weekday = localParts(dayStart, timeZone).weekday;
  const sinceMonday = (weekday + 6) % 7;
  return startOfLocalDay(
    new Date(dayStart.getTime() - sinceMonday * DAY_MS + DAY_MS / 2),
    timeZone
  );
}

/** The local day after the one starting at `dayStart`. */
function nextLocalDay(dayStart: Date, timeZone: string): Date {
  return startOfLocalDay(
    new Date(dayStart.getTime() + DAY_MS + DAY_MS / 2),
    timeZone
  );
}

/**
 * The daily and weekly chapters due between what the last chapter of each
 * kind already covers and the start of today — never today itself, which is
 * still being written. Each range starts where its kind's previous chapter
 * ended (or where the river begins) and ends at a local midnight.
 */
export function dueChapterRanges(input: {
  /** Where the last DAILY chapter ends, or where the river begins. */
  dailyFrom: Date;
  now: Date;
  timeZone: string;
  /** Where the last WEEKLY chapter ends, or where the river begins. */
  weeklyFrom: Date;
}): ChapterRange[] {
  const { timeZone } = input;
  const todayStart = startOfLocalDay(input.now, timeZone);
  const lookbackFloor = new Date(
    todayStart.getTime() - MAX_LOOKBACK_DAYS * DAY_MS
  );
  const ranges: ChapterRange[] = [];

  // Daily: one per complete local day after `dailyFrom`.
  let dayStart = startOfLocalDay(input.dailyFrom, timeZone);
  let dayEnd = nextLocalDay(dayStart, timeZone);
  while (dayEnd.getTime() <= todayStart.getTime()) {
    if (dayEnd.getTime() > input.dailyFrom.getTime()) {
      const start = new Date(
        Math.max(dayStart.getTime(), input.dailyFrom.getTime())
      );
      if (dayEnd.getTime() <= lookbackFloor.getTime()) {
        // Everything older than the look-back folds into one range ending
        // at the floor, so an idle year does not become 365 chapters.
        const last = ranges.at(-1);
        if (last && last.kind === "daily") {
          last.end = dayEnd;
        } else {
          ranges.push({ end: dayEnd, kind: "daily", start });
        }
      } else {
        ranges.push({ end: dayEnd, kind: "daily", start });
      }
    }
    dayStart = dayEnd;
    dayEnd = nextLocalDay(dayStart, timeZone);
  }

  // Weekly: one per complete local ISO week after `weeklyFrom`.
  let weekStart = startOfLocalWeek(input.weeklyFrom, timeZone);
  let weekEnd = startOfLocalDay(
    new Date(weekStart.getTime() + 7 * DAY_MS + DAY_MS / 2),
    timeZone
  );
  while (weekEnd.getTime() <= todayStart.getTime()) {
    if (weekEnd.getTime() > input.weeklyFrom.getTime()) {
      const start = new Date(
        Math.max(weekStart.getTime(), input.weeklyFrom.getTime())
      );
      if (weekEnd.getTime() <= lookbackFloor.getTime()) {
        const last = ranges.at(-1);
        if (last && last.kind === "weekly") {
          last.end = weekEnd;
        } else {
          ranges.push({ end: weekEnd, kind: "weekly", start });
        }
      } else {
        ranges.push({ end: weekEnd, kind: "weekly", start });
      }
    }
    weekStart = weekEnd;
    weekEnd = startOfLocalDay(
      new Date(weekStart.getTime() + 7 * DAY_MS + DAY_MS / 2),
      timeZone
    );
  }
  return ranges;
}

/**
 * The chapter's own name for its stretch — "Tue, 16 Sep", "Week of 15 Sep",
 * "16 Sep – 18 Sep" — in the person's zone. The model's title says what
 * happened; this says when.
 */
export function formatChapterRange(input: {
  end: Date;
  kind: ThreadCompactionKind;
  locale?: string;
  start: Date;
  timeZone: string;
}): string {
  const locale = input.locale ?? "en-GB";
  const day = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: input.timeZone,
  });
  const weekdayDay = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: input.timeZone,
    weekday: "short",
  });
  // A range ending at midnight covers the day BEFORE that midnight.
  const lastInstant = new Date(input.end.getTime() - 1);
  if (input.kind === "daily") {
    return weekdayDay.format(lastInstant);
  }
  if (input.kind === "weekly") {
    return `Week of ${day.format(input.start)}`;
  }
  const first = day.format(input.start);
  const last = day.format(lastInstant);
  return first === last ? weekdayDay.format(lastInstant) : `${first} – ${last}`;
}
