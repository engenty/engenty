import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runEnvSet } from "./env-set.js";

function workspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "engenty-env-set-"));
}

describe("runEnvSet", () => {
  it("writes a known variable", () => {
    const root = workspace();
    runEnvSet({
      force: false,
      manifestComplete: true,
      key: "PUBLIC_APP_URL",
      scope: "deploy",
      value: "https://app.example.com",
      workspaceRoot: root,
    });
    expect(fs.readFileSync(path.join(root, "deploy/.env"), "utf8")).toContain(
      "PUBLIC_APP_URL=https://app.example.com"
    );
  });

  it("refuses a key the manifest does not know", () => {
    expect(() =>
      runEnvSet({
        force: false,
        manifestComplete: true,
        key: "NOT_AN_ENGENTY_VAR",
        scope: "deploy",
        value: "x",
        workspaceRoot: workspace(),
      })
    ).toThrow(/not a known engenty variable/);
  });

  it("writes an unknown key under --force", () => {
    const root = workspace();
    runEnvSet({
      force: true,
      manifestComplete: true,
      key: "NOT_AN_ENGENTY_VAR",
      scope: "deploy",
      value: "x",
      workspaceRoot: root,
    });
    expect(fs.readFileSync(path.join(root, "deploy/.env"), "utf8")).toContain(
      "NOT_AN_ENGENTY_VAR=x"
    );
  });

  it("rejects a value the spec's validator refuses", () => {
    expect(() =>
      runEnvSet({
        force: false,
        manifestComplete: true,
        key: "PUBLIC_APP_URL",
        scope: "deploy",
        value: "not-a-url",
        workspaceRoot: workspace(),
      })
    ).toThrow(/PUBLIC_APP_URL/);
  });

  it("answers for the home scope under the deploy contract", () => {
    const home = workspace();
    const previous = process.env.ENGENTY_HOME;
    process.env.ENGENTY_HOME = home;
    try {
      runEnvSet({
        force: false,
        manifestComplete: true,
        key: "SUPABASE_DB_URL",
        scope: "home",
        value: "postgresql://postgres@127.0.0.1:5432/postgres",
        // Ignored for `home`: the file is resolved from ENGENTY_HOME.
        workspaceRoot: "",
      });
      expect(fs.readFileSync(path.join(home, ".env"), "utf8")).toContain(
        "SUPABASE_DB_URL=postgresql://"
      );
    } finally {
      process.env.ENGENTY_HOME = previous;
    }
  });

  it("refuses a scope the variable does not belong to", () => {
    expect(() =>
      runEnvSet({
        force: false,
        manifestComplete: true,
        key: "ENGENTY_DEV_EMAIL",
        scope: "deploy",
        value: "dev@example.com",
        workspaceRoot: workspace(),
      })
    ).toThrow(/does not belong in the deploy scope/);
  });
});
