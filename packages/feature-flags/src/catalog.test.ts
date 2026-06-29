import { describe, expect, it } from "vitest";
import { dedupeDefinitions, groupByNamespace, isValidKey } from "./catalog.js";
import type { FeatureFlagDefinition } from "./types.js";

describe("isValidKey", () => {
  it("accepts valid dot-notation keys", () => {
    expect(isValidKey("contacts.organisation_accounts")).toBe(true);
    expect(isValidKey("modules.time_tracking")).toBe(true);
  });

  it("rejects invalid keys", () => {
    expect(isValidKey("")).toBe(false);
    expect(isValidKey("single")).toBe(false);
    expect(isValidKey("123.invalid")).toBe(false);
  });
});

describe("dedupeDefinitions", () => {
  it("keeps first definition when duplicate keys", () => {
    const defs: FeatureFlagDefinition[] = [
      {
        key: "contacts.organisation_accounts",
        namespace: "contacts",
        default: true,
        pluginId: "contacts",
      },
      {
        key: "contacts.organisation_accounts",
        namespace: "contacts",
        default: false,
        pluginId: "other",
      },
    ];
    const { catalog, duplicates } = dedupeDefinitions(defs);
    expect(catalog).toHaveLength(1);
    expect(catalog[0].default).toBe(true);
    expect(duplicates.length).toBeGreaterThan(0);
  });

  it("rejects invalid keys", () => {
    const defs: FeatureFlagDefinition[] = [
      { key: "invalid", namespace: "x", default: true, pluginId: "p" },
    ];
    const { catalog, duplicates } = dedupeDefinitions(defs);
    expect(catalog).toHaveLength(0);
    expect(duplicates.length).toBeGreaterThan(0);
  });
});

describe("groupByNamespace", () => {
  it("groups definitions by namespace", () => {
    const defs: FeatureFlagDefinition[] = [
      {
        key: "contacts.a",
        namespace: "contacts",
        default: true,
        pluginId: "c",
      },
      {
        key: "contacts.b",
        namespace: "contacts",
        default: true,
        pluginId: "c",
      },
      { key: "modules.x", namespace: "modules", default: false, pluginId: "m" },
    ];
    const map = groupByNamespace(defs);
    expect(map.get("contacts")).toHaveLength(2);
    expect(map.get("modules")).toHaveLength(1);
  });
});
