import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Workspace } from "@mastra/core/workspace";
import { describe, expect, it } from "vitest";
import { placeholderSessionWorkspace } from "../controller-session.js";

const BASE = path.join(tmpdir(), "engenty-session-placeholder-workspace");

describe("placeholder session workspace", () => {
  it("is needed because an empty workspace is rejected", () => {
    // Documents why a placeholder exists at all. If this ever stops throwing,
    // the placeholder can be replaced by a workspace that touches no disk.
    expect(() => new Workspace({ name: "empty" })).toThrow(
      /requires at least a filesystem, sandbox, or skills/
    );
    // An empty skills array does not satisfy it either.
    expect(() => new Workspace({ name: "empty", skills: [] })).toThrow();
  });

  it("roots two users in separate directories", () => {
    // The whole point: one shared directory for every tenant is what this
    // replaces.
    const a = "11111111-1111-4111-8111-111111111111";
    const b = "22222222-2222-4222-8222-222222222222";
    expect(placeholderSessionWorkspace(a).id).toBeTruthy();
    expect(placeholderSessionWorkspace(b).id).toBeTruthy();
    expect(existsSync(path.join(BASE, a))).toBe(true);
    expect(existsSync(path.join(BASE, b))).toBe(true);
  });

  it("cannot be walked out of the base directory", () => {
    placeholderSessionWorkspace("../../etc");
    expect(existsSync(path.join(BASE, "______etc"))).toBe(true);
    // The traversal target itself must not have been created.
    expect(existsSync(path.join(tmpdir(), "..", "..", "etc", "engenty"))).toBe(
      false
    );
  });

  it("falls back to a fixed segment for an id with nothing usable", () => {
    placeholderSessionWorkspace("///");
    expect(existsSync(path.join(BASE, "___"))).toBe(true);
  });
});
