import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error -- plain .mjs script, no type declarations
import { resolveSupabaseCliBin } from "./supabase-cli.mjs";

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

describe("resolveSupabaseCliBin", () => {
  it("returns the workspace .bin shim when present", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-supabase-"));
    tmpDirs.push(root);
    const binDir = path.join(root, "node_modules", ".bin");
    fs.mkdirSync(binDir, { recursive: true });
    const bin = path.join(binDir, "supabase");
    fs.writeFileSync(bin, "");
    expect(resolveSupabaseCliBin(root)).toBe(bin);
  });

  it("tells you to pnpm install when the shim is missing", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-supabase-"));
    tmpDirs.push(root);
    expect(() => resolveSupabaseCliBin(root)).toThrow(/pnpm install/);
  });
});
