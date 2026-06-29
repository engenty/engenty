import { describe, expect, it } from "vitest";
import { collectModuleNamespacesFromI18nKeys } from "./collect-module-namespaces-from-i18n-keys.js";

describe("collectModuleNamespacesFromI18nKeys", () => {
  it("returns sorted unique namespaces from prefixed keys", () => {
    expect(
      collectModuleNamespacesFromI18nKeys([
        "inbox:featureFlags.enabled",
        "expenses:featureFlags.scan",
        "inbox:featureFlags.autoClassify",
        undefined,
        "plain.key.only",
        "",
      ])
    ).toEqual(["expenses", "inbox"]);
  });

  it("returns empty array when no prefixed keys", () => {
    expect(
      collectModuleNamespacesFromI18nKeys(["featureFlags.title", "common.only"])
    ).toEqual([]);
  });
});
