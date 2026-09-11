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
        parentRef: null,
        ref,
      });
    }
  });

  it("carries the PARENT ref when the listing knew it", () => {
    // Writes address a file by folder + name, and a provider entry carries no
    // parent — so the id is where the listing's knowledge of position is kept.
    const id = encodeConnectorNodeId(CONNECTION, "dir/file.txt", "dir");
    expect(decodeConnectorNodeId(id)).toEqual({
      connectionId: CONNECTION,
      parentRef: "dir",
      ref: "dir/file.txt",
    });
  });

  it("encodes the connection root as an empty parent, not as unknown", () => {
    // A file sitting in the granted folder has a known position: the root.
    // Encoding that as `""` lets a write pass `folder_ref: null`. Omitting the
    // parent (legacy ids) is the unknown case and must keep refusing.
    const id = encodeConnectorNodeId(CONNECTION, "index.md", "");
    expect(decodeConnectorNodeId(id)).toEqual({
      connectionId: CONNECTION,
      parentRef: "",
      ref: "index.md",
    });
  });

  it("still decodes an id minted before parents were carried", () => {
    // Backward compatible by construction: the parent is APPENDED, so an old
    // id reports `parentRef: null` — which reads as "position unknown" and
    // makes the write paths refuse rather than guess.
    const legacy = `cnx:${CONNECTION}:${btoa("file.txt").replace(/=+$/, "")}`;
    expect(decodeConnectorNodeId(legacy)?.parentRef).toBeNull();
  });

  it("round-trips a parent ref with slashes and unicode", () => {
    const id = encodeConnectorNodeId(CONNECTION, "a/ü.pdf", "a/über/ordner");
    expect(decodeConnectorNodeId(id)?.parentRef).toBe("a/über/ordner");
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
