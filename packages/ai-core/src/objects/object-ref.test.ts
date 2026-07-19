import { describe, expect, it } from "vitest";
import {
  formatObjectRef,
  objectRefTypeKey,
  parseObjectRef,
  readObjectRenderMeta,
} from "./object-ref.js";

describe("parseObjectRef / formatObjectRef", () => {
  it("round-trips a canonical ref", () => {
    const ref = parseObjectRef("contacts:contact:0198c9a2-abc");
    expect(ref).toEqual({
      module: "contacts",
      entity: "contact",
      id: "0198c9a2-abc",
    });
    expect(formatObjectRef(ref!)).toBe("contacts:contact:0198c9a2-abc");
  });

  it("keeps colons inside the id segment", () => {
    const ref = parseObjectRef("inbox:message:gmail:abc:123");
    expect(ref).toEqual({
      module: "inbox",
      entity: "message",
      id: "gmail:abc:123",
    });
  });

  it("rejects malformed refs", () => {
    expect(parseObjectRef("contacts:contact")).toBeNull();
    expect(parseObjectRef("contacts::id")).toBeNull();
    expect(parseObjectRef(":contact:id")).toBeNull();
    expect(parseObjectRef("con tacts:contact:id")).toBeNull();
    expect(parseObjectRef("contacts:contact:   ")).toBeNull();
  });

  it("builds the registry type key without the id", () => {
    expect(objectRefTypeKey({ module: "offers", entity: "offer" })).toBe(
      "offers:offer"
    );
  });
});

describe("readObjectRenderMeta", () => {
  const meta = {
    refs: ["contacts:contact:a", "contacts:contact:b"],
    display: "inline",
    items: [{ ref: "contacts:contact:a", title: "ACME", subtitle: "Vienna" }],
    provenance: { total: 84, query: "acme" },
    dropped: ["contacts:contact:c"],
  };

  it("reads a valid marker", () => {
    const result = readObjectRenderMeta({
      ok: true,
      _meta: { engenty: { object_render: meta } },
    });
    expect(result?.refs).toHaveLength(2);
    expect(result?.display).toBe("inline");
    expect(result?.items[0]).toEqual({
      ref: "contacts:contact:a",
      title: "ACME",
      subtitle: "Vienna",
    });
    expect(result?.provenance).toEqual({ total: 84, query: "acme" });
    expect(result?.dropped).toEqual(["contacts:contact:c"]);
  });

  it("defaults unknown display hints to inline", () => {
    const result = readObjectRenderMeta({
      _meta: { engenty: { object_render: { ...meta, display: "popup" } } },
    });
    expect(result?.display).toBe("inline");
  });

  it("returns null without refs or marker", () => {
    expect(readObjectRenderMeta(null)).toBeNull();
    expect(readObjectRenderMeta({ _meta: {} })).toBeNull();
    expect(
      readObjectRenderMeta({
        _meta: { engenty: { object_render: { ...meta, refs: [] } } },
      })
    ).toBeNull();
  });

  it("drops malformed items instead of failing", () => {
    const result = readObjectRenderMeta({
      _meta: {
        engenty: {
          object_render: {
            ...meta,
            items: [{ ref: "x" }, { ref: "contacts:contact:a", title: "A" }],
          },
        },
      },
    });
    expect(result?.items).toEqual([{ ref: "contacts:contact:a", title: "A" }]);
  });
});
