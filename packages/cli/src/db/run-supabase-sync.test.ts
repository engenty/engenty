import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runSupabaseSyncScript } from "./run-supabase-sync.js";

describe("runSupabaseSyncScript", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { force: true, recursive: true });
    }
  });

  // A missing scaffold is a broken checkout, never a silent skip.
  it("throws when the supabase scaffold is absent", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-no-supabase-"));
    tempDirs.push(dir);
    fs.writeFileSync(
      path.join(dir, "package.json"),
      `${JSON.stringify({ workspaces: ["modules/*"] }, null, 2)}\n`,
      "utf8"
    );

    expect(() => runSupabaseSyncScript({ cwd: dir })).toThrow(
      "scripts/supabase-sync.mjs or supabase/config.toml.example is missing"
    );
  });
});
