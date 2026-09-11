import { describe, expect, it } from "vitest";
import {
  detectBrowserWwwLocale,
  detectWwwLocale,
  getWwwCopy,
  parseWwwLocalePath,
  resolveRootRedirectLocale,
  WWW_LOCALES,
  wwwAutoHref,
  wwwLocaleHref,
} from "./i18n";
import { perchParts } from "./perch";

const PILLAR_IDS = ["plugins", "spaces", "ag-ui", "data", "models"];

describe("landing copy", () => {
  it("covers the five phase-1 pillars in both locales", () => {
    for (const locale of WWW_LOCALES) {
      expect(getWwwCopy(locale).pillars.map((p) => p.id)).toEqual(PILLAR_IDS);
    }
  });

  it("points install at the public repo in both locales", () => {
    for (const locale of WWW_LOCALES) {
      expect(getWwwCopy(locale).install.commands[0]).toContain(
        "github.com/engenty/engenty"
      );
    }
  });

  it("labels the language chooser in both locales", () => {
    expect(getWwwCopy("en").languageChooser).toEqual({
      auto: "Auto",
      de: "Deutsch",
      en: "English",
    });
    expect(getWwwCopy("de").languageChooser).toEqual({
      auto: "Auto",
      de: "Deutsch",
      en: "English",
    });
    expect(getWwwCopy("de").nav.language).toBe("Sprache");
  });

  it("perches mascots on a word that exists in the heading", () => {
    for (const locale of WWW_LOCALES) {
      const copy = getWwwCopy(locale);
      expect(copy.hero.headline).toContain(copy.hero.headlinePerch);
      expect(copy.features.spaces.title).toContain(copy.features.spaces.perch);
      expect(copy.features.agUi.title).toContain(copy.features.agUi.perch);
      expect(copy.features.stack.title).toContain(copy.features.stack.perch);
      expect(copy.install.title).toContain(copy.install.perch);
    }
  });
});

describe("perchParts", () => {
  it("sits on a named word and keeps surrounding text", () => {
    expect(perchParts("A room for the work that lasts", "that")).toEqual([
      "A room for the work ",
      "that",
      " lasts",
    ]);
  });

  it("falls back to the last word", () => {
    expect(perchParts("Three commands. Your laptop.")).toEqual([
      "Three commands. Your ",
      "laptop.",
      "",
    ]);
  });
});

describe("parseWwwLocalePath", () => {
  it("reads explicit /en and /de prefixes", () => {
    expect(parseWwwLocalePath("/en")).toBe("en");
    expect(parseWwwLocalePath("/en/")).toBe("en");
    expect(parseWwwLocalePath("/de")).toBe("de");
    expect(parseWwwLocalePath("/de/")).toBe("de");
    expect(parseWwwLocalePath("/de/anything")).toBe("de");
  });

  it("treats / as Auto (no locale)", () => {
    expect(parseWwwLocalePath("/")).toBeNull();
    expect(parseWwwLocalePath("")).toBeNull();
    expect(parseWwwLocalePath("/fr")).toBeNull();
  });
});

describe("www locale hrefs", () => {
  it("keeps search and hash when switching locales", () => {
    expect(wwwLocaleHref("de", "?ref=nav", "#install")).toBe(
      "/de?ref=nav#install"
    );
    expect(wwwLocaleHref("en", "", "#install")).toBe("/en#install");
    expect(wwwAutoHref("?ref=nav", "#install")).toBe("/?ref=nav#install");
    expect(wwwAutoHref()).toBe("/");
  });
});

describe("detectBrowserWwwLocale", () => {
  it("maps de* ahead of other tags", () => {
    expect(detectBrowserWwwLocale(["de"])).toBe("de");
    expect(detectBrowserWwwLocale(["de-DE", "en"])).toBe("de");
    expect(detectBrowserWwwLocale(["de-AT"])).toBe("de");
    expect(detectBrowserWwwLocale(["fr-FR", "de-CH"])).toBe("de");
  });

  it("falls back to en when no de* tag is preferred first among supported", () => {
    expect(detectBrowserWwwLocale(["en-US"])).toBe("en");
    expect(detectBrowserWwwLocale(["en-US", "de"])).toBe("en");
    expect(detectBrowserWwwLocale(["fr-FR"])).toBe("en");
  });
});

describe("resolveRootRedirectLocale", () => {
  it("uses a stored en/de override on the Auto URL", () => {
    expect(resolveRootRedirectLocale("de", ["en-US"])).toBe("de");
    expect(resolveRootRedirectLocale("en", ["de-DE"])).toBe("en");
  });

  it("detects from the browser when Auto is stored or missing", () => {
    expect(resolveRootRedirectLocale("auto", ["de-AT"])).toBe("de");
    expect(resolveRootRedirectLocale(null, ["fr-FR"])).toBe("en");
    expect(resolveRootRedirectLocale("nope", ["de"])).toBe("de");
  });
});

describe("detectWwwLocale", () => {
  it("prefers a stored en or de choice", () => {
    expect(detectWwwLocale("fr-FR", "de")).toBe("de");
    expect(detectWwwLocale("de-AT", "en")).toBe("en");
  });

  it("treats stored auto as no override", () => {
    expect(detectWwwLocale("de-DE", "auto")).toBe("de");
    expect(detectWwwLocale("en-GB", "auto")).toBe("en");
  });

  it("maps de* navigator languages to de", () => {
    expect(detectWwwLocale("de", null)).toBe("de");
    expect(detectWwwLocale("de-DE", null)).toBe("de");
    expect(detectWwwLocale("de-AT", null)).toBe("de");
  });

  it("falls back to en for other languages", () => {
    expect(detectWwwLocale("en-US", null)).toBe("en");
    expect(detectWwwLocale("fr-FR", null)).toBe("en");
  });

  it("ignores invalid stored values", () => {
    expect(detectWwwLocale("de-CH", "fr")).toBe("de");
    expect(detectWwwLocale("en-GB", "nope")).toBe("en");
  });
});
