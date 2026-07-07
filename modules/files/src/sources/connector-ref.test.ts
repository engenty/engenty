import { describe, expect, it } from "vitest";
import {
  decodeConnectorNodeId,
  encodeConnectorNodeId,
  isConnectorNodeId,
} from "./connector-ref.js";

const CONNECTION = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

describe("connector node ids", () => {
  it("round-trips refs containing slashes, colons and unicode", () => {
    for (const ref of [
      "sub/dir/file.txt",
      "key:with:colons",
      "ümlaut/файл.pdf",
      "trailing/slash/",
      "",
    ]) {
      const id = encodeConnectorNodeId(CONNECTION, ref);
      expect(isConnectorNodeId(id)).toBe(true);
      expect(decodeConnectorNodeId(id)).toEqual({
        connectionId: CONNECTION,
        ref,
      });
    }
  });

  it("produces URL-safe ids", () => {
    const id = encodeConnectorNodeId(CONNECTION, "a/b+c?d=e&f");
    expect(id).not.toMatch(
      /[+/=?&]/u.source.replace("?&", "") ? /[+/=]/ : /$^/
    );
    expect(id).toMatch(/^cnx:[0-9a-f-]+:[A-Za-z0-9_-]*$/);
  });

  it("rejects non-connector and malformed ids", () => {
    expect(decodeConnectorNodeId("not-a-cnx-id")).toBeNull();
    expect(decodeConnectorNodeId("cnx:")).toBeNull();
    expect(decodeConnectorNodeId("cnx:missing-separator")).toBeNull();
    expect(isConnectorNodeId("3fa85f64-5717-4562-b3fc-2c963f66afa6")).toBe(
      false
    );
  });
});
