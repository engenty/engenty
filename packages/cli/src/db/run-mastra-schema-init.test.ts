import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { mastraInitChildEnv } from "./run-mastra-schema-init.js";

const dirs: string[] = [];

function workspace(envLocal: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-mastra-init-"));
  dirs.push(root);
  fs.writeFileSync(path.join(root, "pnpm-workspace.yaml"), "packages: []\n");
  fs.writeFileSync(path.join(root, ".env.local"), envLocal);
  return root;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

describe("mastraInitChildEnv", () => {
  it("reads the connection string from the file the env wizard just wrote", () => {
    const root = workspace(
      "SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:56322/postgres\n"
    );
    const env = mastraInitChildEnv(root, { PATH: "/bin" });
    expect(env.SUPABASE_DB_URL).toBe(
      "postgresql://postgres:postgres@127.0.0.1:56322/postgres"
    );
    expect(env.PATH).toBe("/bin");
  });

  it("prefers the file over a value this process loaded at start", () => {
    const root = workspace(
      "SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:56322/postgres\n"
    );
    const env = mastraInitChildEnv(root, {
      SUPABASE_DB_URL:
        "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    });
    expect(env.SUPABASE_DB_URL).toContain(":56322/");
  });

  it("leaves the process value alone when the file has none", () => {
    const root = workspace("# SUPABASE_DB_URL=\n");
    const env = mastraInitChildEnv(root, { SUPABASE_DB_URL: "keep" });
    expect(env.SUPABASE_DB_URL).toBe("keep");
  });
});
