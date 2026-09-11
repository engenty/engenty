import { describe, expect, it } from "vitest";
import {
  fileSpaceOwnerKey,
  parseFileSpaceOwnerKey,
  projectFileSpaceOwner,
  spaceFileSpaceOwner,
} from "./file-space-owner.js";

describe("parseFileSpaceOwnerKey", () => {
  it("round-trips a space owner", () => {
    const owner = spaceFileSpaceOwner("abc");
    expect(parseFileSpaceOwnerKey(fileSpaceOwnerKey(owner))).toEqual(owner);
  });

  it("round-trips a project owner", () => {
    const owner = projectFileSpaceOwner("pr1");
    expect(parseFileSpaceOwnerKey(fileSpaceOwnerKey(owner))).toEqual(owner);
  });

  it("returns null for missing or malformed keys", () => {
    expect(parseFileSpaceOwnerKey(null)).toBeNull();
    expect(parseFileSpaceOwnerKey("")).toBeNull();
    expect(parseFileSpaceOwnerKey("folder:abc")).toBeNull();
    expect(parseFileSpaceOwnerKey("space:")).toBeNull();
    expect(parseFileSpaceOwnerKey("space")).toBeNull();
  });
});
