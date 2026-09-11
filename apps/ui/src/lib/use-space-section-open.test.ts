/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it } from "vitest";
import {
  readSpaceSectionOpen,
  SPACE_SECTION_OPEN_KEYS,
  writeSpaceSectionOpen,
} from "./use-space-section-open";

const KEY = SPACE_SECTION_OPEN_KEYS.modules;

describe("space section open persistence", () => {
  afterEach(() => {
    window.localStorage.removeItem(KEY);
  });

  it("defaults to open when nothing is stored", () => {
    expect(readSpaceSectionOpen(KEY, "matthias")).toBe(true);
  });

  it("remembers a collapsed section per space", () => {
    writeSpaceSectionOpen(KEY, "matthias", false);
    writeSpaceSectionOpen(KEY, "sales", true);
    expect(readSpaceSectionOpen(KEY, "matthias")).toBe(false);
    expect(readSpaceSectionOpen(KEY, "sales")).toBe(true);
  });

  it("treats a corrupt payload as the default", () => {
    window.localStorage.setItem(KEY, "not-json");
    expect(readSpaceSectionOpen(KEY, "matthias")).toBe(true);
    expect(readSpaceSectionOpen(KEY, "matthias", false)).toBe(false);
  });

  it("honours an explicit default when nothing is stored", () => {
    expect(readSpaceSectionOpen(KEY, "matthias", false)).toBe(false);
  });
});
