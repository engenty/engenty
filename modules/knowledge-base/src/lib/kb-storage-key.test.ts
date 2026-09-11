import { parseFileStorageSpaceObjectKey } from "@engenty/file-storage";
import { describe, expect, it } from "vitest";
import {
  isKbStorageKey,
  kbStorageKey,
  kbStoragePrefix,
} from "./kb-storage-key.js";

const TENANT = "11111111-1111-4111-8111-111111111111";
const SPACE = "22222222-2222-4222-8222-222222222222";
const OTHER_SPACE = "33333333-3333-4333-8333-333333333333";

const kb = {
  id: "44444444-4444-4444-8444-444444444444",
  slug: "handbook",
  space_id: SPACE,
  tenant_id: TENANT,
};

describe("kbStorageKey", () => {
  it("roots KB bytes BELOW the space boundary", () => {
    // The whole point of the tier: the space is a path segment, so a
    // space-scoped run cannot address another space's KB media because no
    // path leads there. A key that starts `tenants/<t>/knowledge-base/…`
    // is the pre-Phase-6 layout and must not come back.
    expect(kbStorageKey(kb, "covers", "cover.png")).toBe(
      `tenants/${TENANT}/spaces/${SPACE}/knowledge-base/handbook/covers/cover.png`
    );
  });

  it("produces a key the space parser recognises", () => {
    const parsed = parseFileStorageSpaceObjectKey(kbStorageKey(kb, "a.png"));
    expect(parsed).toMatchObject({
      moduleFolder: "knowledge-base",
      spaceId: SPACE,
      tenantId: TENANT,
    });
  });

  it("falls back to the id when a KB has no slug", () => {
    expect(kbStorageKey({ ...kb, slug: null }, "x.png")).toContain(
      `/knowledge-base/${kb.id}/`
    );
  });

  it("puts two spaces' libraries on disjoint prefixes", () => {
    // Containment by construction — neither prefix is a prefix of the other,
    // so a listing of one cannot reach the other's bytes.
    const a = kbStoragePrefix(kb);
    const b = kbStoragePrefix({ ...kb, space_id: OTHER_SPACE });
    expect(a).not.toBe(b);
    expect(a.startsWith(b)).toBe(false);
    expect(b.startsWith(a)).toBe(false);
  });

  it("rejects a key belonging to the same KB in another space", () => {
    const foreign = kbStorageKey(
      { ...kb, space_id: OTHER_SPACE },
      "covers",
      "cover.png"
    );
    expect(isKbStorageKey(kb, foreign)).toBe(false);
  });

  it("accepts its own keys, and not the bare prefix", () => {
    expect(isKbStorageKey(kb, kbStorageKey(kb, "covers", "c.png"))).toBe(true);
    // The prefix itself addresses no object; treating it as one would let a
    // caller pass the folder where a file is expected.
    expect(isKbStorageKey(kb, kbStoragePrefix(kb))).toBe(false);
  });
});
