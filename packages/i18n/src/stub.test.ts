import { describe, expect, it } from "vitest";
import { createStubI18nApi } from "./stub.js";

describe("createStubI18nApi", () => {
  it("t returns key unchanged", () => {
    const api = createStubI18nApi();
    expect(api.t("foo.bar")).toBe("foo.bar");
  });

  it("registerNamespace is a no-op", () => {
    const api = createStubI18nApi();
    expect(() => {
      api.registerNamespace({
        pluginId: "test",
        namespace: "test",
        loadersByLocale: {},
      });
    }).not.toThrow();
  });

  it("preloadCoreNamespaces resolves", async () => {
    const api = createStubI18nApi();
    await expect(api.preloadCoreNamespaces("en")).resolves.toBeUndefined();
  });
});
