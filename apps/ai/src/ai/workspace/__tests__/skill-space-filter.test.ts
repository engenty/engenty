import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FileNotFoundError, LocalFilesystem } from "@mastra/core/workspace";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseEngentyWorkspaceRuntimeSpec } from "../contracts.js";
import { wrapSkillFilesystem } from "../filtered-skill-filesystem.js";
import { initEngentyAgentWorkspace } from "../loader.js";

const TENANT_ID = "tenant-skill-filter";

function skillMarkdown(
  name: string,
  description: string,
  body: string
): string {
  return [
    "---",
    `name: ${name}`,
    `description: ${description}`,
    "---",
    "",
    `# ${name}`,
    "",
    body,
    "",
  ].join("\n");
}

function writeManagedSkill(
  localRoot: string,
  tenantId: string,
  name: string,
  description: string,
  body: string
): void {
  const dir = join(
    localRoot,
    "tenants",
    tenantId,
    "ai",
    "skills",
    "managed",
    name
  );
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), skillMarkdown(name, description, body));
}

describe("FilteredSkillFilesystem", () => {
  let localRoot: string;

  beforeEach(() => {
    localRoot = mkdtempSync(join(tmpdir(), "engenty-skill-fs-"));
    mkdirSync(join(localRoot, "managed", "projects-management"), {
      recursive: true,
    });
    mkdirSync(join(localRoot, "managed", "invoices-search"), {
      recursive: true,
    });
    writeFileSync(
      join(localRoot, "managed", "projects-management", "SKILL.md"),
      skillMarkdown(
        "projects-management",
        "Manage projects in the current Space.",
        "List projects in current_space."
      )
    );
    writeFileSync(
      join(localRoot, "managed", "invoices-search", "SKILL.md"),
      skillMarkdown(
        "invoices-search",
        "Search the tenant invoice ledger.",
        "Invoice ledger totals live here."
      )
    );
  });

  afterEach(() => {
    rmSync(localRoot, { force: true, recursive: true });
  });

  it("lists only allowed skill directories and hides the rest from read", async () => {
    const inner = new LocalFilesystem({ basePath: localRoot });
    await inner._init();
    const filtered = wrapSkillFilesystem(inner, ["projects-management"]);

    const listed = await filtered.readdir("managed");
    expect(listed.map((entry) => entry.name).sort()).toEqual([
      "projects-management",
    ]);

    await expect(
      filtered.readFile("managed/projects-management/SKILL.md", {
        encoding: "utf-8",
      })
    ).resolves.toContain("projects-management");
    await expect(
      filtered.readFile("managed/invoices-search/SKILL.md", {
        encoding: "utf-8",
      })
    ).rejects.toBeInstanceOf(FileNotFoundError);
    expect(await filtered.exists("managed/invoices-search/SKILL.md")).toBe(
      false
    );
  });
});

describe("workspace skill discovery Space filter", () => {
  let localRoot: string;

  beforeEach(() => {
    localRoot = mkdtempSync(join(tmpdir(), "engenty-skill-ws-"));
    process.env.ENGENTY_WORKSPACE_FS = "local";
    process.env.ENGENTY_LOCAL_WORKSPACE_ROOT = localRoot;

    writeManagedSkill(
      localRoot,
      TENANT_ID,
      "projects-management",
      "Manage projects in the current Space.",
      "List projects in current_space."
    );
    writeManagedSkill(
      localRoot,
      TENANT_ID,
      "pr-review",
      "Review pull requests for this Space.",
      "Review pull requests mounted on the Space."
    );
    writeManagedSkill(
      localRoot,
      TENANT_ID,
      "changelog",
      "Preferred changelog skill.",
      "Write a changelog the agent prefers."
    );
    writeManagedSkill(
      localRoot,
      TENANT_ID,
      "invoices-search",
      "Search the tenant invoice ledger.",
      "Invoice ledger totals live here."
    );
  });

  afterEach(() => {
    delete process.env.ENGENTY_WORKSPACE_FS;
    delete process.env.ENGENTY_LOCAL_WORKSPACE_ROOT;
    rmSync(localRoot, { force: true, recursive: true });
  });

  async function workspaceWithAllowed(allowedSkillNames?: string[]) {
    const spec = parseEngentyWorkspaceRuntimeSpec({
      agentConfig: {
        id: "engenty.copilot",
        instructions: "",
        model: "openai/gpt-4.1-mini",
        name: "Copilot",
        tenantId: TENANT_ID,
      },
      bm25: true,
      enableSkillSearch: true,
      skillDiscoveryPaths: ["/skills/managed"],
      mounts: [
        {
          fileStorageRelativePath: "ai/workspace/users/user-1/",
          mountPath: "/home",
        },
        {
          fileStorageRelativePath: "ai/skills/",
          mountPath: "/skills",
          readOnly: true,
        },
      ],
      ...(allowedSkillNames === undefined ? {} : { allowedSkillNames }),
    });
    return initEngentyAgentWorkspace(spec);
  }

  it("exposes explicit, mounted-module, and preferred skills while hiding unmounted ones from skill_search", async () => {
    const { workspace } = await workspaceWithAllowed([
      "projects-management",
      "pr-review",
      "changelog",
    ]);

    const listed = (await workspace.skills?.list()) ?? [];
    const names = listed.map((skill) => skill.name).sort();
    expect(names).toEqual(["changelog", "pr-review", "projects-management"]);
    expect(names).not.toContain("invoices-search");

    const hits = (await workspace.skills?.search("invoice ledger")) ?? [];
    expect(hits.map((hit) => hit.skillName)).not.toContain("invoices-search");
    expect(await workspace.skills?.get("invoices-search")).toBeNull();
  });

  it("hides every skill directory when the Space is unresolved", async () => {
    const { workspace } = await workspaceWithAllowed([]);
    expect((await workspace.skills?.list()) ?? []).toEqual([]);
    expect(
      ((await workspace.skills?.search("projects")) ?? []).map(
        (hit) => hit.skillName
      )
    ).toEqual([]);
  });

  it("keeps tenant-wide discovery on a global run", async () => {
    const { workspace } = await workspaceWithAllowed();
    const names = ((await workspace.skills?.list()) ?? [])
      .map((skill) => skill.name)
      .sort();
    expect(names).toEqual([
      "changelog",
      "invoices-search",
      "pr-review",
      "projects-management",
    ]);
  });
});
