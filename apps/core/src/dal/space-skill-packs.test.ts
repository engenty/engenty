import { describe, expect, it } from "vitest";
import {
  shouldRetainSkillOnPackUnmount,
  skillNamesForLibraryCategory,
  UnknownSkillPackError,
} from "./space-skill-packs.js";

describe("skillNamesForLibraryCategory", () => {
  it("expands a known category from the library map", () => {
    expect(
      skillNamesForLibraryCategory("productivity", {
        productivity: ["xlsx", "pdf"],
      })
    ).toEqual(["xlsx", "pdf"]);
  });

  it("throws for an empty or unknown category", () => {
    expect(() => skillNamesForLibraryCategory("apple", {})).toThrow(
      UnknownSkillPackError
    );
  });
});

describe("shouldRetainSkillOnPackUnmount", () => {
  it("retains a module-owned name when that module is still mounted", () => {
    expect(
      shouldRetainSkillOnPackUnmount("contacts-search", new Set(["contacts"]))
    ).toBe(true);
    expect(shouldRetainSkillOnPackUnmount("xlsx", new Set(["contacts"]))).toBe(
      false
    );
  });
});
