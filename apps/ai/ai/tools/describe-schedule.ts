import cronstrue from "cronstrue";

/**
 * A cron line as a person reads it ("At 07:00, Monday through Friday"). The
 * raw expression is for the scheduler; nobody approving or reading about a
 * routine should have to parse `0 7 * * 1-5`.
 */
export function describeCron(cron: string | null | undefined): string {
  const trimmed = cron?.trim();
  if (!trimmed) {
    return "on a schedule";
  }
  try {
    return cronstrue.toString(trimmed, { use24HourTimeFormat: true });
  } catch {
    return `on the schedule ${trimmed}`;
  }
}
