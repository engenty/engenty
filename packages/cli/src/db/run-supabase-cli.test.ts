import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveSupabaseCliBin } from "./supabase-cli-bin.js";

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

describe("resolveSupabaseCliBin", () => {
  it("returns the workspace .bin shim when present", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-sb-"));
    tmpDirs.push(root);
    const binDir = path.join(root, "node_modules", ".bin");
    fs.mkdirSync(binDir, { recursive: true });
    const bin = path.join(binDir, "supabase");
    fs.writeFileSync(bin, "");
    expect(resolveSupabaseCliBin(root)).toBe(bin);
  });

  it("tells you to pnpm install when the shim is missing", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-sb-"));
    tmpDirs.push(root);
    expect(() => resolveSupabaseCliBin(root)).toThrow(/pnpm install/);
  });
});
