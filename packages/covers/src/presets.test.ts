import { describe, expect, it } from "vitest";
import {
  COVER_THEME_LIGHT_COLOR_VARS,
  COVER_THEME_VIBRANT_COLOR_VARS,
  coverIsLight,
  coverMatchesPresetValue,
  normalizeGradientCss,
} from "./presets.js";

describe("coverMatchesPresetValue", () => {
  it("matches color case-insensitively", () => {
    expect(
      coverMatchesPresetValue({ type: "color", value: "#ABC" }, "color", "#abc")
    ).toBe(true);
  });

  it("matches gradient with spacing differences", () => {
    const a = "linear-gradient(135deg, var(--ember) 0%, var(--cobalt) 100%)";
    const b =
      "linear-gradient(135deg,  var(--ember)  0%,  var(--cobalt)  100%)";
    expect(normalizeGradientCss(a)).toBe(normalizeGradientCss(b));
    expect(
      coverMatchesPresetValue({ type: "gradient", value: a }, "gradient", b)
    ).toBe(true);
  });
});

describe("coverIsLight", () => {
  it("treats missing cover as light (dark text on canvas)", () => {
    expect(coverIsLight(null)).toBe(true);
    expect(coverIsLight(undefined)).toBe(true);
  });

  it("treats image and gradient covers as dark (light text)", () => {
    expect(coverIsLight({ type: "image", value: "vault://foo.png" })).toBe(
      false
    );
    expect(
      coverIsLight({
        type: "gradient",
        value: "linear-gradient(135deg, var(--ember) 0%, var(--cobalt) 100%)",
      })
    ).toBe(false);
  });

  it("maps known light color tokens to a light surface", () => {
    for (const token of COVER_THEME_LIGHT_COLOR_VARS) {
      expect(coverIsLight({ type: "color", value: `var(${token})` })).toBe(
        true
      );
    }
  });

  it("maps known vibrant color tokens to a dark surface", () => {
    for (const token of COVER_THEME_VIBRANT_COLOR_VARS) {
      expect(coverIsLight({ type: "color", value: `var(${token})` })).toBe(
        false
      );
    }
  });

  it("falls back to luminance for raw hex / rgb colors", () => {
    expect(coverIsLight({ type: "color", value: "#ffffff" })).toBe(true);
    expect(coverIsLight({ type: "color", value: "#fff" })).toBe(true);
    expect(coverIsLight({ type: "color", value: "#000000" })).toBe(false);
    expect(coverIsLight({ type: "color", value: "#222" })).toBe(false);
    expect(coverIsLight({ type: "color", value: "rgb(20, 20, 20)" })).toBe(
      false
    );
    expect(coverIsLight({ type: "color", value: "rgb(240, 240, 240)" })).toBe(
      true
    );
  });
});
