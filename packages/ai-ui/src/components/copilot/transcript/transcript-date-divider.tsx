"use client";

// A date line where a conversation picks up again after a break: more than
// half an hour since the message before. Today and yesterday say so; older
// days name the weekday and date.

import { useTranslation } from "@engenty/i18n/ui";

export const DATE_DIVIDER_GAP_MS = 30 * 60 * 1000;

function toMs(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Whether a divider goes before a message. A message without a time is one
 * this session just sent or received — it happened now.
 */
export function needsDateDivider(
  previousAt: string | null | undefined,
  at: string | null | undefined,
  now: number = Date.now()
): boolean {
  const previous = toMs(previousAt);
  if (previous === null) {
    return false;
  }
  return (toMs(at) ?? now) - previous > DATE_DIVIDER_GAP_MS;
}

function startOfDay(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function dateDividerParts(
  at: number,
  now: number
): { day: "today" | "yesterday" | "date"; sameYear: boolean } {
  const days = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000);
  return {
    day: days === 0 ? "today" : days === 1 ? "yesterday" : "date",
    sameYear: new Date(at).getFullYear() === new Date(now).getFullYear(),
  };
}

export function TranscriptDateDivider({
  at,
}: {
  at: string | null | undefined;
}) {
  const { t, i18n } = useTranslation("ai-ui");
  const now = Date.now();
  const ms = toMs(at) ?? now;
  const locale = i18n.language || "en";
  const time = new Date(ms).toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
  });
  const { day, sameYear } = dateDividerParts(ms, now);
  const label =
    day === "date"
      ? `${new Date(ms).toLocaleDateString(locale, {
          day: "numeric",
          month: "short",
          weekday: "short",
          ...(sameYear ? {} : { year: "numeric" }),
        })} ${time}`
      : t(`dateDivider.${day}`, { time });
  return (
    <div
      className="text-center text-muted-foreground text-xs tabular-nums"
      data-testid="date-divider"
    >
      {label}
    </div>
  );
}
