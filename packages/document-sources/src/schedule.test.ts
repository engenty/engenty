import { describe, expect, it } from "vitest";
import {
  computeDocumentSourceNextRunAt,
  describeDocumentSourceCronExpression,
  validateDocumentSourceCronExpression,
} from "./schedule.js";

describe("validateDocumentSourceCronExpression", () => {
  it("accepts a valid 5-field expression", () => {
    expect(validateDocumentSourceCronExpression("0 9 * * *", "UTC").ok).toBe(
      true
    );
  });

  it("rejects invalid expressions", () => {
    const r = validateDocumentSourceCronExpression("not a cron", "UTC");
    expect(r.ok).toBe(false);
  });
});

describe("computeDocumentSourceNextRunAt", () => {
  it("uses interval when kind is interval", () => {
    expect(
      computeDocumentSourceNextRunAt(
        {
          schedule: {
            enabled: true,
            interval_minutes: 30,
            kind: "interval",
            timezone: "UTC",
          },
        },
        new Date("2026-01-01T00:00:00.000Z")
      )
    ).toBe("2026-01-01T00:30:00.000Z");
  });

  it("uses cron when kind is cron", () => {
    const next = computeDocumentSourceNextRunAt(
      {
        schedule: {
          cron_expression: "0 9 * * *",
          enabled: true,
          interval_minutes: null,
          kind: "cron",
          timezone: "UTC",
        },
      },
      new Date("2026-05-04T10:00:00.000Z")
    );
    expect(next).toBe("2026-05-05T09:00:00.000Z");
  });

  it("returns null when disabled", () => {
    expect(
      computeDocumentSourceNextRunAt(
        {
          schedule: {
            cron_expression: "0 9 * * *",
            enabled: false,
            interval_minutes: null,
            kind: "cron",
            timezone: "UTC",
          },
        },
        new Date()
      )
    ).toBeNull();
  });
});

describe("describeDocumentSourceCronExpression", () => {
  it("returns human text for valid cron", () => {
    const text = describeDocumentSourceCronExpression("0 9 * * *");
    expect(text).toBeTruthy();
    expect(text!.length).toBeGreaterThan(5);
  });
});
