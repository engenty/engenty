import { describe, expect, it } from "vitest";
import { applyCsvHeaders, cleanupCSV } from "./cleanup-csv.js";
import { parseCSV } from "./parse-csv.js";

/** Minimal fixture mirroring gsales exports (no header, unquoted newlines). */
const GSALES_LIKE = [
  "s1008;Erste Group Immorent AG;Frau;Mag. Katharina;Unger;Am Belvedere 1;1100;Wien;;marion.p@engarde.net;;;04.04.2016;;",
  "s1009;Erste Group Bank AG;Frau;Yaryna;Lukan;OE 0196 0379 / Group Internal Communications",
  "Am Belvedere 1;1100;Wien;;marion.p@engarde.net;;;04.04.2016;;",
  "s1010;Erste Group Bank AG;Frau;MMag. Dr. Alexandra;Müller-Stingl;Group Human Ressources",
  "Am Belvedere 1;1100;Wien;AT (Österreich);marion.p@engarde.net;;;04.04.2016;;",
  "s1011;Erste Group Bank AG;Frau;Margarita;Yonova;OE 0196 0317 / Group Remuneration and Org. Effectiveness",
  "Am Belvedere 1;1100;Wien;AT (Österreich);marion.p@engarde.net;;;04.04.2016;;",
].join("\n");

describe("cleanupCSV", () => {
  it("leaves a clean headered CSV unchanged aside from trailing newline", () => {
    const content = "name;email\nAda;ada@example.com\n";
    const result = cleanupCSV(content);
    expect(result.headers).toEqual(["name", "email"]);
    expect(result.rowCount).toBe(1);
    expect(result.suggestAiHeaders).toBe(false);
    expect(result.parsed.rows[0]).toEqual(["Ada", "ada@example.com"]);
    expect(parseCSV(result.cleanedContent).totalRows).toBe(1);
  });

  it("repairs gsales-style unquoted multiline addresses and synthesizes headers", () => {
    const result = cleanupCSV(GSALES_LIKE);

    expect(result.delimiter).toBe(";");
    expect(result.changes.map((c) => c.code)).toEqual(
      expect.arrayContaining(["record_start_repair", "header_synthesized"])
    );
    expect(result.suggestAiHeaders).toBe(true);
    expect(result.headers[0]).toBe("column_1");
    expect(result.rowCount).toBe(4);

    const s1009 = result.parsed.rows.find((row) => row[0] === "s1009");
    expect(s1009).toBeDefined();
    expect(s1009?.[5]).toContain("Group Internal Communications");
    expect(s1009?.[5]).toContain("Am Belvedere 1");
    expect(s1009?.[5]).not.toContain("\n");

    // Round-trip: cleaned content parses with stable column counts
    const reparsed = parseCSV(result.cleanedContent);
    expect(reparsed.totalRows).toBe(result.rowCount);
    expect(
      reparsed.rows.every((row) => row.length === reparsed.headers.length)
    ).toBe(true);
  });

  it("applies preferred headers when synthesizing", () => {
    const content = "s1;Acme;Ada\ns2;Beta;Bob\ns3;Gamma;Gus\n";
    const result = cleanupCSV(content, {
      preferredHeaders: ["customer_id", "company", "first_name"],
    });
    expect(result.headers).toEqual(["customer_id", "company", "first_name"]);
    expect(result.suggestAiHeaders).toBe(false);
    expect(result.rowCount).toBe(3);
  });

  it("applyCsvHeaders rewrites the cleaned content", () => {
    const content = "s1;Acme\ns2;Beta\ns3;Gamma\n";
    const cleaned = cleanupCSV(content);
    const withHeaders = applyCsvHeaders(cleaned, ["id", "company"]);
    expect(withHeaders.headers).toEqual(["id", "company"]);
    expect(withHeaders.cleanedContent.startsWith("id;company\n")).toBe(true);
    expect(withHeaders.suggestAiHeaders).toBe(false);
  });

  it("strips BOM and normalizes CRLF", () => {
    const content = "\uFEFFname,email\r\nAda,ada@example.com\r\n";
    const result = cleanupCSV(content);
    expect(result.changes.map((c) => c.code)).toEqual(
      expect.arrayContaining(["bom_removed", "line_endings_normalized"])
    );
    expect(result.cleanedContent.includes("\r")).toBe(false);
  });
});
