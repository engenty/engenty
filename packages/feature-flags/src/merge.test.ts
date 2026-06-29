import { describe, expect, it } from "vitest";
import { isEnabled, mergeResolved } from "./merge.js";
import type { FeatureFlagDefinition } from "./types.js";

describe("mergeResolved", () => {
  const definitions: FeatureFlagDefinition[] = [
    {
      key: "contacts.organisation_accounts",
      namespace: "contacts",
      default: true,
      pluginId: "contacts",
    },
    {
      key: "contacts.personal_accounts",
      namespace: "contacts",
      default: true,
      pluginId: "contacts",
    },
  ];

  it("uses definition defaults when no overrides", () => {
    const result = mergeResolved(definitions, {}, {});
    expect(result["contacts.organisation_accounts"]).toBe(true);
    expect(result["contacts.personal_accounts"]).toBe(true);
  });

  it("tenant override takes precedence over global", () => {
    const result = mergeResolved(
      definitions,
      { "contacts.organisation_accounts": false },
      { "contacts.organisation_accounts": true }
    );
    expect(result["contacts.organisation_accounts"]).toBe(true);
  });

  it("global override takes precedence over default", () => {
    const result = mergeResolved(
      definitions,
      { "contacts.organisation_accounts": false },
      {}
    );
    expect(result["contacts.organisation_accounts"]).toBe(false);
    expect(result["contacts.personal_accounts"]).toBe(true);
  });

  it("default used when no override exists", () => {
    const defs: FeatureFlagDefinition[] = [
      {
        key: "test.off_by_default",
        namespace: "test",
        default: false,
        pluginId: "test",
      },
    ];
    const result = mergeResolved(defs, {}, {});
    expect(result["test.off_by_default"]).toBe(false);
  });
});

describe("isEnabled", () => {
  it("returns true when flag is true", () => {
    expect(isEnabled({ a_b: true }, "a_b")).toBe(true);
  });

  it("returns false when flag is false", () => {
    expect(isEnabled({ a_b: false }, "a_b")).toBe(false);
  });

  it("returns false when flag missing", () => {
    expect(isEnabled({}, "a_b")).toBe(false);
  });
});
