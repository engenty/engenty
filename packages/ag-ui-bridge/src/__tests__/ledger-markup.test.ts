import { describe, expect, it } from "vitest";
import {
  ledgerTagTone,
  ledgerTextAsCode,
  ledgerTextAsMarkdown,
  parseLedgerMarkup,
  splitLedgerDetail,
  unwrapLedgerText,
} from "../ledger-markup.js";

describe("parseLedgerMarkup", () => {
  it("splits bracket tags from surrounding text", () => {
    expect(
      parseLedgerMarkup(
        "[reasoning] [tool-invocation: skill] [step-start] Hello"
      )
    ).toEqual([
      { arg: null, kind: "tag", name: "reasoning" },
      { kind: "text", value: " " },
      { arg: "skill", kind: "tag", name: "tool-invocation" },
      { kind: "text", value: " " },
      { arg: null, kind: "tag", name: "step-start" },
      { kind: "text", value: " Hello" },
    ]);
  });
});

describe("splitLedgerDetail", () => {
  it("peels id/chars meta off the body", () => {
    expect(
      splitLedgerDetail(
        "id  e5c8be01-f9da-41bf-9910-0b6c264ec4a5\n6317 chars\n\n[reasoning] hi"
      )
    ).toEqual({
      body: "[reasoning] hi",
      meta: ["id  e5c8be01-f9da-41bf-9910-0b6c264ec4a5", "6317 chars"],
    });
  });
});

describe("ledgerTagTone", () => {
  it("marks tool invocations separately from reasoning", () => {
    expect(ledgerTagTone("tool-invocation")).toBe("tool");
    expect(ledgerTagTone("reasoning")).toBe("reasoning");
    expect(ledgerTagTone("step-start")).toBe("muted");
  });
});

describe("unwrapLedgerText", () => {
  it("unfolds a JSON string token", () => {
    expect(unwrapLedgerText('"# Hire an agent\\n\\nLoad this skill"')).toBe(
      "# Hire an agent\n\nLoad this skill"
    );
  });

  it("unfolds literal backslash-n when quotes were stripped", () => {
    expect(unwrapLedgerText("# Hire an agent\\n\\nLoad this skill")).toBe(
      "# Hire an agent\n\nLoad this skill"
    );
  });

  it("leaves ordinary markdown unchanged", () => {
    expect(unwrapLedgerText("# Hire an agent\n\nLoad this skill")).toBe(
      "# Hire an agent\n\nLoad this skill"
    );
  });
});

describe("ledgerTextAsCode", () => {
  it("pretty-prints JSON objects", () => {
    expect(ledgerTextAsCode('{"name":"hire-agent"}')).toBe(
      '{\n  "name": "hire-agent"\n}'
    );
  });
});

describe("ledgerTextAsMarkdown", () => {
  it("wraps JSON objects in a json fence", () => {
    expect(ledgerTextAsMarkdown('{"name":"hire-agent"}')).toBe(
      '```json\n{\n  "name": "hire-agent"\n}\n```'
    );
  });

  it("passes markdown through after unwrapping", () => {
    expect(ledgerTextAsMarkdown('"## Identity\\n\\nYou are engenty"')).toBe(
      "## Identity\n\nYou are engenty"
    );
  });
});
