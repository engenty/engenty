import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { canRunDbSnapshot, runDbSnapshotScript } from "./run-db-snapshot.js";

describe("runDbSnapshotScript", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { force: true, recursive: true });
    }
  });

  it("no-ops when db-snapshot script is absent", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-no-db-snapshot-"));
    tempDirs.push(dir);
    fs.writeFileSync(
      path.join(dir, "package.json"),
      `${JSON.stringify({ workspaces: ["modules/*"] }, null, 2)}\n`,
      "utf8"
    );

    expect(canRunDbSnapshot(dir)).toBe(false);
    expect(runDbSnapshotScript({ action: "snapshot", cwd: dir })).toEqual({
      ok: true,
      output: "",
      ran: false,
    });
  });
});
