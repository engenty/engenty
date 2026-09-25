// A routine line the platform posts (created, started), worded for the reader.
// The server has no language to write it in; the row carries the facts.
import type { RoutineNotice } from "@engenty/ag-ui-bridge";
import { cronToHumanLabel } from "../../../features/routines/schedule-cron.js";

type Translate = (key: string, values?: Record<string, unknown>) => string;

export function routineNoticeText(
  notice: RoutineNotice,
  t: Translate,
  locale: string
): string {
  const key = "agentDesk.routineNotice";
  if (notice.kind === "started") {
    return t(`${key}.started`, { name: notice.name });
  }
  const when = notice.schedule
    ? cronToHumanLabel(notice.schedule.cron, locale, notice.schedule.timezone)
    : notice.event
      ? t(`${key}.whenEvent`)
      : t(`${key}.whenPressed`);
  return [
    t(`${key}.created`, { name: notice.name, when }),
    notice.workflowName
      ? t(`${key}.workflow`, { workflow: notice.workflowName })
      : null,
    notice.grants > 0 ? t(`${key}.grants`, { count: notice.grants }) : null,
  ]
    .filter((line): line is string => line !== null)
    .join(" ");
}
