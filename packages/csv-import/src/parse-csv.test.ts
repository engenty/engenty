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
    expect(result.rows[0][0]).toBe("Acme, Inc.");
    expect(result.rows[0][1]).toBe("John");
  });

  it("parses Google Sheets / Excel TSV with multiline quoted cells", () => {
    const content = [
      "Vorname\tNachname\tUnternehmen\tKontakt\tAdresse",
      'Nadja\tBucher\tnb-factory\t0664\t"Franziskanergasse 1/ Graz\nFörderung beantragt"',
      'Dieter\tRathei\t"DR YIELD\n (Ines)"\t0664\tOpernring 4',
      'David\tRam\tTyromotion\t"0043 660\ndavid@tyro.com"\t"Bahnhofgürtel 59\nGesellschafter"',
    ].join("\n");

    const result = parseCSV(content);
    expect(detectDelimiter(content)).toBe("\t");
    expect(result.headers).toEqual([
      "Vorname",
      "Nachname",
      "Unternehmen",
      "Kontakt",
      "Adresse",
    ]);
    expect(result.totalRows).toBe(3);
    expect(result.rows[0][4]).toBe(
      "Franziskanergasse 1/ Graz\nFörderung beantragt"
    );
    expect(result.rows[1][2]).toBe("DR YIELD\n (Ines)");
    expect(result.rows[2][3]).toBe("0043 660\ndavid@tyro.com");
    expect(result.rows[2][4]).toBe("Bahnhofgürtel 59\nGesellschafter");
    expect(result.rows.every((row) => row.length === 5)).toBe(true);
  });

  it("skips blank rows between header and data", () => {
    const content = "a\tb\tc\n\n\nx\ty\tz";
    const result = parseCSV(content);
    expect(result.totalRows).toBe(1);
    expect(result.rows[0]).toEqual(["x", "y", "z"]);
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
