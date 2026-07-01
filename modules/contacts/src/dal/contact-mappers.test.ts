import { describe, expect, it } from "vitest";
import { sanitizePartialPatch } from "./contact-mappers.js";

describe("sanitizePartialPatch", () => {
  it("includes only keys present in input", () => {
    const result = sanitizePartialPatch({
      website_contact: "https://example.com",
    });
    expect(result).toEqual({ website_contact: "https://example.com" });
    expect(Object.keys(result)).toHaveLength(1);
  });

  it("sanitizes null to null for null-capable fields", () => {
    const result = sanitizePartialPatch({
      website_contact: "https://x.com",
      email: null,
    });
    expect(result).toEqual({
      website_contact: "https://x.com",
      email: null,
    });
  });

  it("sanitizes contact_name to empty string when null", () => {
    const result = sanitizePartialPatch({
      contact_name: null,
    });
    expect(result).toEqual({ contact_name: "" });
  });

  it("does not add or modify keys not in input", () => {
    const result = sanitizePartialPatch({
      website_impress: "https://example.com/impress",
    });
    expect(result).toEqual({
      website_impress: "https://example.com/impress",
    });
    expect("website_contact" in result).toBe(false);
    expect("email" in result).toBe(false);
  });
});
