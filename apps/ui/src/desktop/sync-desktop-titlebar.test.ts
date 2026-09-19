/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  applyThemeColorMeta,
  parseCssColorToRgba,
  rgbaToHex,
} from "./sync-desktop-titlebar";

describe("parseCssColorToRgba", () => {
  it("parses comma rgb and rgba", () => {
    expect(parseCssColorToRgba("rgb(30, 64, 175)")).toEqual({
      red: 30,
      green: 64,
      blue: 175,
      alpha: 255,
    });
    expect(parseCssColorToRgba("rgba(30, 64, 175, 0.5)")).toEqual({
      red: 30,
      green: 64,
      blue: 175,
      alpha: 128,
    });
  });

  it("parses space-separated rgb with slash alpha", () => {
    expect(parseCssColorToRgba("rgb(30 64 175 / 80%)")).toEqual({
      red: 30,
      green: 64,
      blue: 175,
      alpha: 204,
    });
  });

  it("parses hex", () => {
    expect(parseCssColorToRgba("#1e40af")).toEqual({
      red: 30,
      green: 64,
      blue: 175,
      alpha: 255,
    });
  });

  it("returns null for empty or transparent", () => {
    expect(parseCssColorToRgba("")).toBeNull();
    expect(parseCssColorToRgba("transparent")).toBeNull();
  });
});

describe("rgbaToHex", () => {
  it("formats 0–255 channels as #rrggbb", () => {
    expect(rgbaToHex({ red: 30, green: 64, blue: 175, alpha: 255 })).toBe(
      "#1e40af"
    );
  });
});

describe("applyThemeColorMeta", () => {
  afterEach(() => {
    for (const el of document.querySelectorAll('meta[name="theme-color"]')) {
      el.remove();
    }
  });

  it("updates every theme-color meta", () => {
    document.head.insertAdjacentHTML(
      "beforeend",
      '<meta content="#e0531b" media="(prefers-color-scheme: light)" name="theme-color">' +
        '<meta content="#1a1a1a" media="(prefers-color-scheme: dark)" name="theme-color">'
    );
    applyThemeColorMeta("#1e40af");
    const values = [
      ...document.querySelectorAll('meta[name="theme-color"]'),
    ].map((el) => el.getAttribute("content"));
    expect(values).toEqual(["#1e40af", "#1e40af"]);
  });
});
