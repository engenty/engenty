import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const script = path.join(repoRoot, "scripts", "strip-closed-doc-nav.mjs");

function tree(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-docs-"));
  for (const [relative, content] of Object.entries(files)) {
    const full = path.join(root, "docs", "content", relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, "utf-8");
  }
  return root;
}

function run(root: string): { ok: boolean; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [script, root], {
      encoding: "utf8",
    });
    return { ok: true, stderr: "", stdout };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    return {
      ok: false,
      stderr: failure.stderr ?? "",
      stdout: failure.stdout ?? "",
    };
  }
}

function read(root: string, relative: string): string {
  return fs.readFileSync(path.join(root, "docs", "content", relative), "utf-8");
}

describe("strip-closed-doc-nav", () => {
  it("drops nav entries for pages the tree does not have", () => {
    const root = tree({
      "user/meta.json": '{"pages":["README","kept","gone"]}',
      "user/README.md": "# User\n",
      "user/kept.md": "# Kept\n",
    });
    const result = run(root);
    expect(result.ok).toBe(true);
    expect(JSON.parse(read(root, "user/meta.json")).pages).toEqual([
      "README",
      "kept",
    ]);
    expect(result.stdout.trim()).toBe("docs/content/user/meta.json");
  });

  it("keeps a section entry served by its index page", () => {
    const root = tree({
      "user/meta.json": '{"pages":["modules"]}',
      "user/modules/index.md": "# Modules\n",
    });
    expect(run(root).ok).toBe(true);
    expect(JSON.parse(read(root, "user/meta.json")).pages).toEqual(["modules"]);
  });

  it("drops a list item that only links a page the tree does not have", () => {
    const root = tree({
      "user/meta.json": '{"pages":["index","kept"]}',
      "user/index.md":
        "# Index\n\n- [Kept](/user/kept) — stays.\n- [Gone](/user/gone) — goes.\n",
      "user/kept.md": "# Kept\n",
    });
    expect(run(root).ok).toBe(true);
    const index = read(root, "user/index.md");
    expect(index).toContain("[Kept](/user/kept)");
    expect(index).not.toContain("Gone");
  });

  it("refuses when a dangling link survives in prose", () => {
    const root = tree({
      "user/meta.json": '{"pages":["index"]}',
      "user/index.md":
        "# Index\n\nMirrored to Slack — see [Connect](/user/gone).\n",
    });
    const result = run(root);
    expect(result.ok).toBe(false);
    expect(result.stderr).toContain("user/index.md:3");
  });

  it("ignores links that are not site routes", () => {
    const root = tree({
      "user/meta.json": '{"pages":["index"]}',
      "user/index.md":
        "# Index\n\n[Home](https://engenty.com) [Img](/images/x.png)\n",
    });
    expect(run(root).ok).toBe(true);
  });
});
