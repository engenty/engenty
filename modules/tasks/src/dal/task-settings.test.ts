import { describe, expect, it } from "vitest";
import {
  mergeTaskSettingsUpdate,
  TASKS_TENANT_SETTING,
  taskSettingsFromTenantKv,
  taskSettingsToTenantKv,
} from "./task-settings.js";

describe("taskSettingsFromTenantKv", () => {
  it("reads typed KV rows, including wrapped status definitions", () => {
    const settings = taskSettingsFromTenantKv([
      { name: TASKS_TENANT_SETTING.identifierPrefix, value: "ACME" },
      { name: TASKS_TENANT_SETTING.staleAfterDays, value: "14" },
      {
        name: TASKS_TENANT_SETTING.statusDefinitions,
        value: {
          items: [{ id: "todo", label: "To do", color: "slate", locked: true }],
        },
      },
    ]);
    expect(settings.identifier_prefix).toBe("ACME");
    expect(settings.stale_after_days).toBe(14);
    expect(settings.task_status_definitions[0]?.id).toBe("todo");
  });
});

describe("taskSettingsToTenantKv", () => {
  it("writes the three typed keys", () => {
    const rows = taskSettingsToTenantKv({
      identifier_prefix: "ENG",
      stale_after_days: 7,
      task_status_definitions: [
        { id: "todo", label: "To do", color: "slate", locked: true },
      ],
    });
    expect(rows.map((row) => row.name)).toEqual([
      TASKS_TENANT_SETTING.identifierPrefix,
      TASKS_TENANT_SETTING.staleAfterDays,
      TASKS_TENANT_SETTING.statusDefinitions,
    ]);
  });
});

describe("mergeTaskSettingsUpdate", () => {
  it("keeps current prefix when the patch omits it", () => {
    const current = taskSettingsFromTenantKv([
      { name: TASKS_TENANT_SETTING.identifierPrefix, value: "ACME" },
    ]);
    expect(mergeTaskSettingsUpdate(current, { stale_after_days: 3 })).toEqual(
      expect.objectContaining({
        identifier_prefix: "ACME",
        stale_after_days: 3,
      })
    );
  });
});
