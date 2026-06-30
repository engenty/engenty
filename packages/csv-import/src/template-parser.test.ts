import { describe, expect, it } from "vitest";
import { parseTemplate, validateTemplate } from "./template-parser.js";

describe("template parser", () => {
  it("combines two named columns", () => {
    const value = parseTemplate(
      '{{"First Name"}} {{"Last Name"}}',
      ["Jane", "Doe"],
      ["First Name", "Last Name"]
    );
    expect(value).toBe("Jane Doe");
  });

  it("supports index placeholders", () => {
    const value = parseTemplate("ID-{{[0]}}", ["123"], ["Any"]);
    expect(value).toBe("ID-123");
  });

  it("supports fallback modifier", () => {
    const value = parseTemplate(
      '{{"Email" fallback="unknown@example.com"}}',
      [""],
      ["Email"]
    );
    expect(value).toBe("unknown@example.com");
  });

  it("validates missing headers", () => {
    const result = validateTemplate('{{"Missing"}}', ["Email"]);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/not found/);
  });
});
