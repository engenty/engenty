import { describe, expect, it } from "vitest";
import { deriveInitialThreadTitleFromText } from "../initial-thread-title.js";
import { sanitizeTitleForStorage } from "../thread-title-generation.js";

describe("sanitizeTitleForStorage", () => {
  it("strips ASCII control characters", () => {
    expect(sanitizeTitleForStorage("a\x00b")).toBe("ab");
    expect(sanitizeTitleForStorage("x\x7Fy")).toBe("xy");
  });

  it("strips replacement characters and trims", () => {
    expect(sanitizeTitleForStorage(" \uFFFD hello ")).toBe("hello");
  });
});

describe("deriveInitialThreadTitleFromText", () => {
  it("uses the first user text as a compact initial label", () => {
    expect(
      deriveInitialThreadTitleFromText("  Suche nach Anwälten in Kontakten  ")
    ).toBe("Suche nach Anwälten in Kontakten");
  });

  it("strips common markdown prefixes", () => {
    expect(deriveInitialThreadTitleFromText("> - Suche nochmal")).toBe(
      "Suche nochmal"
    );
    expect(deriveInitialThreadTitleFromText("1. Theme wechseln")).toBe(
      "Theme wechseln"
    );
  });

  it("truncates long labels deterministically", () => {
    expect(
      deriveInitialThreadTitleFromText(
        "Bitte suche in allen Kontakten nach Rechtsanwälten und fasse die Treffer nach Organisation und Ort zusammen"
      )
    ).toBe(
      "Bitte suche in allen Kontakten nach Rechtsanwälten und fasse die Tref..."
    );
  });
});
