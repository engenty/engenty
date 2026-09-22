// The zone the river's days are cut in.
//
// The calendar chapters (chapter-ranges.ts) need a local midnight. Until the
// person's own zone travels with their profile, it is the deployment's:
// `ENGENTY_RIVER_TIME_ZONE`, else the process zone, else UTC. One place, so
// the routes, the tool and the scheduler cannot disagree on what "Tuesday" is.

export const RIVER_TIME_ZONE = "ENGENTY_RIVER_TIME_ZONE";

export function riverTimeZone(): string {
  const configured = process.env[RIVER_TIME_ZONE]?.trim();
  if (configured) {
    return configured;
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
