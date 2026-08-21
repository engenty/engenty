import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error -- plain .mjs script, no type declarations
import {
  readRuntimeChoice,
  runtimeFilePath,
  writeRuntimeChoice,
} from "./container-runtime.mjs";

const tmpDirs: string[] = [];

function tmpRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-runtime-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

describe("container-runtime preference", () => {
  it("reads and writes .engenty/container-runtime", () => {
    const root = tmpRoot();
    writeRuntimeChoice(root, "orbstack");
    expect(fs.readFileSync(runtimeFilePath(root), "utf8")).toBe("orbstack\n");
    expect(readRuntimeChoice(root)).toBe("orbstack");
  });

  it("normalizes the legacy docker alias", () => {
    const root = tmpRoot();
    writeRuntimeChoice(root, "docker");
    expect(readRuntimeChoice(root)).toBe("docker-desktop");
  });

  it("falls back to leftover package.json without writing it back", () => {
    const root = tmpRoot();
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({
        engenty: { containerRuntime: "dory", plugins: {} },
      })
    );
    expect(readRuntimeChoice(root)).toBe("dory");
    expect(fs.existsSync(runtimeFilePath(root))).toBe(false);
    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, "package.json"), "utf8")
    );
    expect(pkg.engenty.containerRuntime).toBe("dory");
  });

  it("prefers the gitignored file over package.json", () => {
    const root = tmpRoot();
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ engenty: { containerRuntime: "dory" } })
    );
    writeRuntimeChoice(root, "orbstack");
    expect(readRuntimeChoice(root)).toBe("orbstack");
  });

  it("rejects unknown runtimes", () => {
    const root = tmpRoot();
    expect(() => writeRuntimeChoice(root, "podman")).toThrow(/Unknown/);
  });
});
