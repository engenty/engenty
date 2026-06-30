import { describe, expect, it } from "vitest";
import { detectDelimiter, parseCSV } from "./parse-csv.js";

describe("parseCSV", () => {
  it("parses comma-delimited CSV with headers", () => {
    const content = `name,email,phone
John Doe,john@example.com,+1234
Jane Smith,jane@example.com,+5678`;
    const result = parseCSV(content);
    expect(result.headers).toEqual(["name", "email", "phone"]);
    expect(result.rows).toEqual([
      ["John Doe", "john@example.com", "+1234"],
      ["Jane Smith", "jane@example.com", "+5678"],
    ]);
    expect(result.totalRows).toBe(2);
  });

  it("parses semicolon-delimited CSV", () => {
    const content = `name;email;phone
Max Mustermann;max@firma.de;+49 123`;
    const result = parseCSV(content);
    expect(result.headers).toEqual(["name", "email", "phone"]);
    expect(result.rows).toEqual([
      ["Max Mustermann", "max@firma.de", "+49 123"],
    ]);
    expect(result.totalRows).toBe(1);
  });

  it("handles quoted fields with commas", () => {
    const content = `company,contact
"Acme, Inc.",John
"Beta Corp",Jane`;
    const result = parseCSV(content);
    expect(result.headers).toEqual(["company", "contact"]);
    expect(result.rows[0][0]).toContain("Acme");
    expect(result.rows[0][1]).toBe("John");
  });

  it("handles empty file", () => {
    expect(() => parseCSV("")).toThrow(/empty/);
  });

  it("handles single header row", () => {
    const content = "a,b,c";
    const result = parseCSV(content);
    expect(result.headers).toEqual(["a", "b", "c"]);
    expect(result.rows).toEqual([]);
    expect(result.totalRows).toBe(0);
  });
});

describe("detectDelimiter", () => {
  it("detects comma when most common", () => {
    const content = "a,b,c\nd,e,f";
    expect(detectDelimiter(content)).toBe(",");
  });

  it("detects semicolon when more common", () => {
    const content = "a;b;c;d\ne;f;g;h";
    expect(detectDelimiter(content)).toBe(";");
  });

  it("detects tab", () => {
    const content = "a\tb\tc\nd\te\tf";
    expect(detectDelimiter(content)).toBe("\t");
  });
});
