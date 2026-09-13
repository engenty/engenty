import { describe, expect, it } from "vitest";
import {
  documentEntries,
  getValue,
  hasPortlessBlock,
  isPortlessOwned,
  PORTLESS_MARKER_END,
  PORTLESS_MARKER_START,
  parseEnvDocument,
  serializeEnvDocument,
  setValue,
} from "./env-file-document.js";

const SAMPLE = `# ── Header comment ──
# Another comment

FOO=bar
EMPTY=
QUOTED="hello world"
# trailing comment
`;

const PORTLESS_SAMPLE = `BEFORE=1

${PORTLESS_MARKER_START}
ENGENTY_API_BASE_URL=https://api.engenty.localhost
${PORTLESS_MARKER_END}

AFTER=2
`;

const MULTILINE_SAMPLE = `KEY_BEFORE=x
PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
abc123
def456
-----END PRIVATE KEY-----"
KEY_AFTER=y
`;

describe("parseEnvDocument / serializeEnvDocument", () => {
  it("round-trips comments, blanks, and entries byte-identically", () => {
    const doc = parseEnvDocument(SAMPLE);
    expect(serializeEnvDocument(doc)).toBe(SAMPLE);
  });

  it("round-trips a multiline quoted value byte-identically", () => {
    const doc = parseEnvDocument(MULTILINE_SAMPLE);
    expect(serializeEnvDocument(doc)).toBe(MULTILINE_SAMPLE);
    expect(getValue(doc, "PRIVATE_KEY")).toContain("BEGIN PRIVATE KEY");
    expect(getValue(doc, "PRIVATE_KEY")).toContain("\n");
    expect(getValue(doc, "KEY_AFTER")).toBe("y");
  });

  it("round-trips the portless block byte-identically", () => {
    const doc = parseEnvDocument(PORTLESS_SAMPLE);
    expect(serializeEnvDocument(doc)).toBe(PORTLESS_SAMPLE);
  });

  it("parses values like loadDotEnv (unquoting, last wins)", () => {
    const doc = parseEnvDocument('A=1\nA=2\nB="with space"\n');
    expect(getValue(doc, "A")).toBe("2");
    expect(getValue(doc, "B")).toBe("with space");
    expect(documentEntries(doc).get("A")).toBe("2");
  });

  it("handles an empty file", () => {
    const doc = parseEnvDocument("");
    expect(doc.lines).toHaveLength(0);
    expect(serializeEnvDocument(doc)).toBe("");
  });
});

describe("setValue", () => {
  it("edits an existing entry in place without touching other lines", () => {
    const doc = parseEnvDocument(SAMPLE);
    setValue(doc, "FOO", "baz");
    const out = serializeEnvDocument(doc);
    expect(out).toContain("FOO=baz");
    expect(out).toContain("# ── Header comment ──");
    expect(out).toContain("# trailing comment");
    expect(out).toContain("QUOTED=");
  });

  it("fills an empty entry in place", () => {
    const doc = parseEnvDocument(SAMPLE);
    setValue(doc, "EMPTY", "now-set");
    expect(serializeEnvDocument(doc)).toContain("EMPTY=now-set");
  });

  it("appends unknown keys at the end with comments", () => {
    const doc = parseEnvDocument(SAMPLE);
    setValue(doc, "NEW_KEY", "value", { commentLines: ["New key comment"] });
    const out = serializeEnvDocument(doc);
    expect(out.endsWith("# New key comment\nNEW_KEY=value\n")).toBe(true);
  });

  it("quotes values containing spaces or #", () => {
    const doc = parseEnvDocument("");
    setValue(doc, "A", "has space");
    setValue(doc, "B", "has#hash");
    const out = serializeEnvDocument(doc);
    expect(out).toContain('A="has space"');
    expect(out).toContain('B="has#hash"');
  });

  it("refuses to edit portless-owned keys", () => {
    const doc = parseEnvDocument(PORTLESS_SAMPLE);
    expect(isPortlessOwned(doc, "ENGENTY_API_BASE_URL")).toBe(true);
    expect(hasPortlessBlock(doc)).toBe(true);
    expect(() =>
      setValue(doc, "ENGENTY_API_BASE_URL", "https://other")
    ).toThrow(/portless/);
    expect(serializeEnvDocument(doc)).toBe(PORTLESS_SAMPLE);
  });

  it("still edits non-portless keys in a file with a portless block", () => {
    const doc = parseEnvDocument(PORTLESS_SAMPLE);
    setValue(doc, "AFTER", "3");
    expect(serializeEnvDocument(doc)).toContain("AFTER=3");
    expect(serializeEnvDocument(doc)).toContain(
      "ENGENTY_API_BASE_URL=https://api.engenty.localhost"
    );
  });
});
