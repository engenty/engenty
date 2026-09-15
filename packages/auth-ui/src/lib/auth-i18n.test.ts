import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_LOCALE_STORAGE_KEY,
  detectAuthLocale,
  setAuthLocalePreference,
} from "./auth-i18n";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

describe("detectAuthLocale", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the browser language when nothing is stored", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    vi.stubGlobal("navigator", { language: "de-AT" });
    expect(detectAuthLocale()).toBe("de");
  });

  it("falls back to English for an unsupported browser language", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    vi.stubGlobal("navigator", { language: "fr-FR" });
    expect(detectAuthLocale()).toBe("en");
  });

  it("lets a stored preference win over the browser", () => {
    const storage = memoryStorage();
    storage.setItem(AUTH_LOCALE_STORAGE_KEY, "en");
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("navigator", { language: "de" });
    expect(detectAuthLocale()).toBe("en");
  });
});

describe("setAuthLocalePreference", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("writes the i18next storage key", () => {
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    setAuthLocalePreference("de");
    expect(storage.getItem(AUTH_LOCALE_STORAGE_KEY)).toBe("de");
  });
});
