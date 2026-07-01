import { describe, expect, it } from "vitest";
import {
  kbSourceCreateSchema,
  kbSourceItemUpdateSchema,
  kbSourceListQuerySchema,
} from "../src/schema/sources.js";
import { scheduleForEnabledToggle } from "../src/sources/schedule-for-enabled-toggle.js";

describe("kbSourceCreateSchema", () => {
  it("accepts a URL source with schedule defaults", () => {
    const parsed = kbSourceCreateSchema.parse({
      adapter_id: "url",
      kb_id: "kb-1",
      name: "Docs",
      settings: { url: "https://example.com/docs" },
    });

    expect(parsed.enabled).toBe(true);
    expect(parsed.missing_item_strategy).toBe("ignore");
    expect(parsed.schedule.enabled).toBe(false);
  });

  it("rejects unsupported adapters", () => {
    const result = kbSourceCreateSchema.safeParse({
      adapter_id: "drive",
      kb_id: "kb-1",
      name: "Drive",
      settings: {},
    });

    expect(result.success).toBe(false);
  });

  it("accepts manual and file_upload adapters", () => {
    const manual = kbSourceCreateSchema.parse({
      adapter_id: "manual",
      enabled: false,
      kb_id: "kb-1",
      name: "Notes",
      settings: { body_markdown: "# Hi", title: "Notes" },
    });
    expect(manual.adapter_id).toBe("manual");

    const file = kbSourceCreateSchema.parse({
      adapter_id: "file_upload",
      enabled: false,
      kb_id: "kb-1",
      name: "Spec",
      settings: {
        original_filename: "spec.pdf",
        storage_object_key: "tenants/t1/knowledge-base/spec.pdf",
      },
    });
    expect(file.adapter_id).toBe("file_upload");
  });

  it("accepts a cron schedule when enabled", () => {
    const parsed = kbSourceCreateSchema.parse({
      adapter_id: "url",
      kb_id: "kb-1",
      name: "Docs",
      schedule: {
        cron_expression: "0 9 * * *",
        enabled: true,
        interval_minutes: null,
        kind: "cron",
        timezone: "UTC",
      },
      settings: { url: "https://example.com/docs" },
    });

    expect(parsed.schedule.kind).toBe("cron");
    expect(parsed.schedule.cron_expression).toBe("0 9 * * *");
    expect(parsed.schedule.interval_minutes).toBeNull();
  });

  it("rejects invalid cron when schedule is enabled", () => {
    const result = kbSourceCreateSchema.safeParse({
      adapter_id: "url",
      kb_id: "kb-1",
      name: "Docs",
      schedule: {
        cron_expression: "not valid cron",
        enabled: true,
        kind: "cron",
        timezone: "UTC",
      },
      settings: { url: "https://example.com/docs" },
    });

    expect(result.success).toBe(false);
  });
});

describe("kbSourceListQuerySchema", () => {
  it("defaults pagination and sorting", () => {
    const parsed = kbSourceListQuerySchema.parse({ kb_id: "kb-1" });

    expect(parsed.page).toBe(1);
    expect(parsed.page_size).toBe(25);
    expect(parsed.sort_by).toBe("updated_at");
    expect(parsed.sort_order).toBe("desc");
  });
});

describe("scheduleForEnabledToggle", () => {
  it("turns off without dropping timezone", () => {
    const out = scheduleForEnabledToggle(
      {
        cron_expression: null,
        enabled: true,
        interval_minutes: 30,
        kind: "interval",
        timezone: "Europe/Berlin",
      },
      false,
      60
    );
    expect(out.enabled).toBe(false);
    expect(out.timezone).toBe("Europe/Berlin");
  });

  it("enables interval with adapter default when interval was null", () => {
    const out = scheduleForEnabledToggle(
      {
        cron_expression: null,
        enabled: false,
        interval_minutes: null,
        kind: "interval",
        timezone: "UTC",
      },
      true,
      120
    );
    expect(out.enabled).toBe(true);
    expect(out.kind).toBe("interval");
    expect(out.interval_minutes).toBe(120);
  });

  it("preserves cron when enabling with a valid expression", () => {
    const out = scheduleForEnabledToggle(
      {
        cron_expression: "0 9 * * *",
        enabled: false,
        interval_minutes: null,
        kind: "cron",
        timezone: "UTC",
      },
      true,
      60
    );
    expect(out.enabled).toBe(true);
    expect(out.kind).toBe("cron");
    expect(out.cron_expression).toBe("0 9 * * *");
  });
});

describe("kbSourceItemUpdateSchema", () => {
  it("allows retrieved items to be ignored", () => {
    expect(kbSourceItemUpdateSchema.parse({ status: "ignored" }).status).toBe(
      "ignored"
    );
  });
});
