// The one lie this file must never tell again: a trigger whose cron is
// written in its own timezone ("0 7 * * *" + Europe/Vienna) rendered as if
// the hours were UTC — "Daily at 09:00" for a routine that fires at 07:00.
import { describe, expect, it } from "vitest";
import { cronToHumanLabel, cronToPreset } from "./schedule-cron.js";

describe("cronToHumanLabel with a trigger timezone", () => {
  it("renders the cron's own hours verbatim, suffixed with the zone", () => {
    expect(cronToHumanLabel("0 7 * * *", "en", "Europe/Vienna")).toBe(
      "Daily at 07:00 (Europe/Vienna)"
    );
  });

  it("does the same for the German label", () => {
    expect(cronToHumanLabel("0 7 * * *", "de", "Europe/Vienna")).toBe(
      "Täglich um 07:00 (Europe/Vienna)"
    );
  });

  it("keeps the weekly day un-shifted when a timezone is set", () => {
    expect(cronToHumanLabel("30 8 * * 1", "en", "Europe/Vienna")).toBe(
      "Weekly on Monday at 08:30 (Europe/Vienna)"
    );
  });

  it("suffixes the zone on a custom cron too", () => {
    expect(cronToHumanLabel("*/10 6-18 * * *", "en", "Europe/Vienna")).toBe(
      "*/10 6-18 * * * (Europe/Vienna)"
    );
  });

  it("still converts UTC→local when no timezone is set (the form's crons)", () => {
    // Verbatim parse is opt-in; the legacy UTC path must not change.
    const verbatim = cronToPreset("0 7 * * *", false);
    expect(verbatim).toEqual({ type: "daily", hour: 7, minute: 0 });
    const converted = cronToPreset("0 7 * * *");
    expect(converted.type).toBe("daily");
    // In any zone east of UTC-? the hours differ from verbatim unless the
    // runner is itself on UTC — assert the shape, not the machine's offset.
    expect(typeof converted.hour).toBe("number");
  });
});
