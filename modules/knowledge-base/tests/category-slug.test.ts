import { describe, expect, it } from "vitest";
import {
  sanitizeCategorySlug,
  slugifyCategoryName,
} from "../ui/components/category-settings-dialog-body.js";

describe("category slug helpers", () => {
  it("slugifyCategoryName inserts dashes between words", () => {
    expect(slugifyCategoryName("Das ist ein Test")).toBe("das-ist-ein-test");
  });

  it("sanitizeCategorySlug keeps user dashes", () => {
    expect(sanitizeCategorySlug("das-ist-ein-test")).toBe("das-ist-ein-test");
  });

  it("sanitizeCategorySlug strips invalid characters without adding dashes", () => {
    expect(sanitizeCategorySlug("hello world!")).toBe("helloworld");
  });
});
