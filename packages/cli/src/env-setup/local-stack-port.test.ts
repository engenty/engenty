import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  describeStackPortMismatch,
  readLocalStackApiPort,
  urlPort,
} from "./local-stack-port.js";

describe("readLocalStackApiPort", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      fs.rmSync(dir, { force: true, recursive: true });
    }
  });

  it("reads [api] port and ignores the other sections' ports", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-port-"));
    dirs.push(root);
    fs.mkdirSync(path.join(root, "supabase"));
    fs.writeFileSync(
      path.join(root, "supabase", "config.toml"),
      'project_id = "x"\n[db]\nport = 56322\n[api]\nenabled = true\nport = 56321\n'
    );
    expect(readLocalStackApiPort(root)).toBe(56_321);
  });

  it("is null without a local config", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-port-"));
    dirs.push(root);
    expect(readLocalStackApiPort(root)).toBeNull();
  });
});

describe("describeStackPortMismatch", () => {
  it("names the two ports when they differ", () => {
    expect(
      describeStackPortMismatch({
        configPort: 56_321,
        envUrl: "http://127.0.0.1:54321",
      })
    ).toContain("port 54321, but this checkout's stack");
  });

  it("is quiet when consistent or unknowable", () => {
    expect(
      describeStackPortMismatch({
        configPort: 56_321,
        envUrl: "http://127.0.0.1:56321",
      })
    ).toBeNull();
    expect(
      describeStackPortMismatch({ configPort: null, envUrl: "x" })
    ).toBeNull();
  });

  it("reads default ports", () => {
    expect(urlPort("https://db.example.com")).toBe(443);
  });
});
