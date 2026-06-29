import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  canRunSupabaseSync,
  runSupabaseSyncScript,
} from "./run-supabase-sync.js";

describe("runSupabaseSyncScript", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { force: true, recursive: true });
    }
  });

  it("no-ops when supabase scaffold is absent", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-no-supabase-"));
    tempDirs.push(dir);
    fs.writeFileSync(
      path.join(dir, "package.json"),
      `${JSON.stringify({ workspaces: ["modules/*"] }, null, 2)}\n`,
      "utf8"
    );

    expect(canRunSupabaseSync(dir)).toBe(false);
    expect(runSupabaseSyncScript({ cwd: dir })).toEqual({
      ok: true,
      output: "",
      ran: false,
    });
  });
});
