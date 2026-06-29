import i18n from "i18next";
import { describe, expect, it, vi } from "vitest";
import { createEngentyI18nApi } from "./engine.js";

describe("createEngentyI18nApi", () => {
  it("registers namespace without overwrite warning when first time", async () => {
    const instance = i18n.createInstance();
    await instance.init({
      lng: "en",
      fallbackLng: "en",
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const api = createEngentyI18nApi(instance, {});

    api.registerNamespace({
      pluginId: "test",
      namespace: "test",
      loadersByLocale: {
        en: () => Promise.resolve({ hello: "Hello" }),
      },
    });

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("no-ops when registering same namespace again (first wins)", async () => {
    const instance = i18n.createInstance();
    await instance.init({
      lng: "en",
      fallbackLng: "en",
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const api = createEngentyI18nApi(instance, {});

    api.registerNamespace({
      pluginId: "test",
      namespace: "test",
      loadersByLocale: { en: () => Promise.resolve({ first: "First" }) },
    });
    api.registerNamespace({
      pluginId: "test2",
      namespace: "test",
      loadersByLocale: { en: () => Promise.resolve({ second: "Second" }) },
    });

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("t returns key when translation missing", async () => {
    const instance = i18n.createInstance();
    await instance.init({
      lng: "en",
      fallbackLng: "en",
    });
    const api = createEngentyI18nApi(instance, {});

    expect(api.t("missing.key")).toBe("missing.key");
  });

  it("preloadCoreNamespaces loads and adds bundles", async () => {
    const instance = i18n.createInstance();
    await instance.init({
      lng: "en",
      fallbackLng: "en",
    });
    const api = createEngentyI18nApi(instance, {
      common: {
        en: () => Promise.resolve({ welcome: "Welcome" }),
      },
    });

    await api.preloadCoreNamespaces("en");

    expect(instance.t("common:welcome")).toBe("Welcome");
  });
});
