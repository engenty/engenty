import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { connectorIdsFor } from "../../../../../ai/tools/connector-import-request-tool.js";
import { resolveSpaceComputerHomePath } from "../../../sandbox/sandbox-storage-paths.js";
import { openSpaceComputerHome } from "../../../sandbox/space-computer-home.js";
import { listSpaceComputerMcpServers } from "../../../sandbox/space-computer-mcp.js";
import { createComputerSkillProvider } from "../computer-skills-provider.js";

// What an installer left in a space computer's $HOME, read from the host.
// Ways this can fail: a link planted in $HOME makes the host read its own
// files (a leak off the host), a skill from another Space is fetched through a
// forged ref, a skill in both roots is offered twice, or a remote MCP server is
// missed / a stdio one offered as importable.
describe("space computer $HOME", () => {
  let root: string;
  let home: string;
  let drive: string;
  const tenantId = "tenant-1";
  const spaceId = "space-1";

  function write(base: string, rel: string, text: string) {
    const target = join(base, rel);
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, text);
  }

  function skill(base: string, dir: string, name: string, description = "") {
    write(
      base,
      `${dir}/SKILL.md`,
      `---\nname: ${name}\n${description ? `description: ${description}\n` : ""}---\nSteps`
    );
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "engenty-computer-home-"));
    process.env.ENGENTY_SPACES_DIR = root;
    home = resolveSpaceComputerHomePath(tenantId, spaceId);
    drive = join(home, "..", "sandbox");
    mkdirSync(home, { recursive: true });
    mkdirSync(drive, { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { force: true, recursive: true });
    delete process.env.ENGENTY_SPACES_DIR;
  });

  it("never follows a link out of $HOME", async () => {
    const secret = join(root, "host-secret.txt");
    writeFileSync(secret, "host only");
    symlinkSync(secret, join(home, ".claude.json"));
    skill(root, "elsewhere/stolen", "stolen");
    mkdirSync(join(home, ".agents"), { recursive: true });
    symlinkSync(join(root, "elsewhere"), join(home, ".agents", "skills"));

    const view = openSpaceComputerHome({ spaceId, tenantId });
    expect(await view.readFile(".claude.json", 1024)).toBeNull();
    expect(await view.readFile("../../host-secret.txt", 1024)).toBeNull();
    const provider = createComputerSkillProvider({ spaceId, tenantId });
    expect(await provider.search("*")).toEqual([]);
  });

  it("finds skills in any agent's folder, a linked copy once, and project installs", async () => {
    // The skills CLI: one canonical copy, agent folders linked to it.
    skill(
      home,
      ".agents/skills/ad-creative",
      "ad-creative",
      "Generate ad creatives"
    );
    write(home, ".agents/skills/ad-creative/references/brand.md", "brand kit");
    mkdirSync(join(home, ".claude", "skills"), { recursive: true });
    symlinkSync(
      "../../.agents/skills/ad-creative",
      join(home, ".claude", "skills", "ad-creative")
    );
    // An agent folder no list names, three levels down.
    skill(home, ".config/opencode/skills/competitor-watch", "competitor-watch");
    // A package that ships a skills folder is not an install.
    skill(home, ".npm/_npx/abc/node_modules/pkg/skills/bundled", "bundled");
    // Project scope: the working dir of the install.
    skill(drive, ".agents/skills/release-notes", "release-notes");

    const provider = createComputerSkillProvider({ spaceId, tenantId });
    const hits = await provider.search("*");
    expect(hits.map((h) => h.name).sort()).toEqual([
      "ad-creative",
      "competitor-watch",
      "release-notes",
    ]);
    expect(await provider.search("competitor")).toHaveLength(1);

    const ad = hits.find((h) => h.name === "ad-creative");
    const fetched = await provider.fetchSkill(ad?.ref ?? { id: "" });
    expect(fetched.skillMarkdown).toContain("Generate ad creatives");
    expect(fetched.files).toEqual([
      { path: "references/brand.md", text: "brand kit" },
    ]);
    const notes = hits.find((h) => h.name === "release-notes");
    expect((await provider.fetchSkill(notes?.ref ?? { id: "" })).name).toBe(
      "release-notes"
    );
  });

  it("refuses a ref that names another Space", async () => {
    skill(home, ".agents/skills/x", "x");
    const provider = createComputerSkillProvider({ spaceId, tenantId });
    await expect(
      provider.fetchSkill({ id: "space-2/home/.agents/skills/x" })
    ).rejects.toThrow();
    await expect(
      provider.fetchSkill({ id: "space-1/home/../../x" })
    ).rejects.toThrow();
  });

  it("lists remote MCP servers as importable and stdio ones as not", async () => {
    write(
      home,
      ".claude.json",
      JSON.stringify({
        mcpServers: {
          vendor: { type: "http", url: "https://mcp.vendor.example/mcp" },
          local: { args: ["server.js"], command: "node" },
        },
      })
    );
    write(
      home,
      ".cursor/mcp.json",
      JSON.stringify({
        mcpServers: { vendor: { url: "https://other.example/mcp" } },
      })
    );
    const servers = await listSpaceComputerMcpServers(
      openSpaceComputerHome({ spaceId, tenantId })
    );
    expect(servers).toEqual([
      {
        found_in: "~/.claude.json",
        kind: "remote",
        name: "vendor",
        url: "https://mcp.vendor.example/mcp",
      },
      {
        command: "node",
        found_in: "~/.claude.json",
        kind: "stdio",
        name: "local",
      },
    ]);
  });
});

// Core's import route refuses ids and prefixes outside these patterns
// (import-service.ts); a name an installer chose must still import.
describe("connectorIdsFor", () => {
  it.each([
    "vendor",
    "Vendor MCP",
    "1password",
    "x",
    "a".repeat(80),
  ])("%s yields an id and prefix core accepts", (name) => {
    const { id, toolPrefix } = connectorIdsFor(name);
    expect(id).toMatch(/^[a-z][a-z0-9-]{1,59}$/);
    expect(toolPrefix).toMatch(/^[a-z][a-z0-9_]{1,30}$/);
  });
});
