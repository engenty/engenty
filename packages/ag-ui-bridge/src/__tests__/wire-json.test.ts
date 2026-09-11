import { describe, expect, it } from "vitest";
import {
  formatWireJson,
  reviveJsonStrings,
  tokenizeJson,
} from "../wire-json.js";

describe("reviveJsonStrings", () => {
  it("parses nested JSON string tokens into objects", () => {
    expect(
      reviveJsonStrings({
        content: '{"ok":true,"items":[{"id":1}]}',
        type: "TOOL_CALL_RESULT",
      })
    ).toEqual({
      content: { ok: true, items: [{ id: 1 }] },
      type: "TOOL_CALL_RESULT",
    });
  });

  it("leaves ordinary strings and incomplete JSON alone", () => {
    expect(reviveJsonStrings({ delta: '{"kind":', query: "hello" })).toEqual({
      delta: '{"kind":',
      query: "hello",
    });
  });
});

describe("formatWireJson", () => {
  it("pretty-prints revived nested JSON", () => {
    expect(
      formatWireJson({
        content: '{"ok":true}',
        type: "result",
      })
    ).toBe('{\n  "content": {\n    "ok": true\n  },\n  "type": "result"\n}');
  });
});

describe("tokenizeJson", () => {
  it("splits keys, strings, numbers, and keywords", () => {
    const tokens = tokenizeJson(
      formatWireJson({ count: 2, ok: true, query: "books" })
    );
    const interesting = tokens.filter((token) => token.kind !== "text");
    expect(interesting).toEqual([
      { kind: "key", value: '"count"' },
      { kind: "punct", value: ":" },
      { kind: "number", value: "2" },
      { kind: "key", value: '"ok"' },
      { kind: "punct", value: ":" },
      { kind: "keyword", value: "true" },
      { kind: "key", value: '"query"' },
      { kind: "punct", value: ":" },
      { kind: "string", value: '"books"' },
    ]);
  });
});
