// Regression: a non-sandbox agent (e.g. engenty.copilot, "assistant" preset)
// must be able to CREATE and OVERWRITE files in its writable mounts — `/space`
// (the Space commons) and `/home` (user-scoped) — through the assembled
// workspace, exactly like the sandbox CLI's syncOut path does. And it must
// NOT write the company drive (`/company/files`), which every Space reads.
//
// History: a report claimed the direct (non-sandbox) commons write failed with
// "Object not found" while the sandbox path worked. The direct write path is
// assembled here: loader → createMountFilesystem (non-sandbox branch, no staging)
// → createWorkspaceMountFilesystem → FilesSDKFilesystem.
//
// Runs offline against the local `fs` adapter (`ENGENTY_WORKSPACE_FS=local`),
// which shares the identical assembly with the remote supabase mount.
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { WorkspaceFilesystem } from "@mastra/core/workspace";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseEngentyWorkspaceRuntimeSpec } from "../contracts.js";
import { createEngentyAgentWorkspace } from "../loader.js";
import {
  buildEngentyMountSpecs,
  expandWorkspaceMounts,
} from "../workspace-presets.js";

const TENANT_ID = "tenant-write-1";
const USER_ID = "user-write-1";
const AGENT_ID = "engenty.copilot";
const SPACE_ID = "space-write-1";

let localRoot: string;

beforeEach(() => {
  localRoot = mkdtempSync(join(tmpdir(), "engenty-ws-write-"));
  process.env.ENGENTY_WORKSPACE_FS = "local";
  process.env.ENGENTY_SPACES_DIR = localRoot;
});

afterEach(() => {
  delete process.env.ENGENTY_WORKSPACE_FS;
  delete process.env.ENGENTY_SPACES_DIR;
  rmSync(localRoot, { force: true, recursive: true });
});

async function buildNonSandboxCopilotWorkspace(): Promise<{
  filesystem: WorkspaceFilesystem;
}> {
  // The assistant preset is the copilot's mount table: /home (rw), /space
  // (rw), /company/files (ro), /skills (ro), /task (when bound). No sandbox →
  // mounts back onto Files SDK.
  const mounts = buildEngentyMountSpecs(
    expandWorkspaceMounts({ enabled: true, preset: "assistant" }),
    {
      agentId: AGENT_ID,
      spaceId: SPACE_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
    }
  );

  const spec = parseEngentyWorkspaceRuntimeSpec({
    agentConfig: {
      id: AGENT_ID,
      instructions: "",
      model: "openai/gpt-4.1-mini",
      name: "Copilot",
      tenantId: TENANT_ID,
    },
    enableSandbox: false,
    mounts,
  });

  const { workspace } = await createEngentyAgentWorkspace(spec);
  return { filesystem: workspace.filesystem as WorkspaceFilesystem };
}

describe("non-sandbox workspace writes (/space, /home)", () => {
  it("creates, reads back, and overwrites a file in /space (commons)", async () => {
    const { filesystem } = await buildNonSandboxCopilotWorkspace();

    await filesystem.writeFile("/space/test.txt", "dummy content");
    expect(
      await filesystem.readFile("/space/test.txt", { encoding: "utf-8" })
    ).toBe("dummy content");

    // Overwrite (the default) must succeed, not trip a pre-write existence probe.
    await filesystem.writeFile("/space/test.txt", "updated content");
    expect(
      await filesystem.readFile("/space/test.txt", { encoding: "utf-8" })
    ).toBe("updated content");

    // The object lands under the Space's commons prefix.
    expect(
      existsSync(
        join(
          localRoot,
          "tenants",
          TENANT_ID,
          "spaces",
          SPACE_ID,
          "ai",
          "workspace",
          "commons",
          "test.txt"
        )
      )
    ).toBe(true);
  });

  it("refuses a write into the company drive", async () => {
    const { filesystem } = await buildNonSandboxCopilotWorkspace();

    await expect(
      filesystem.writeFile("/company/files/test.txt", "published?")
    ).rejects.toThrow();
    expect(
      existsSync(
        join(
          localRoot,
          "tenants",
          TENANT_ID,
          "ai",
          "workspace",
          "commons",
          "test.txt"
        )
      )
    ).toBe(false);
  });

  it("creates a file in /home (user-scoped) for a non-sandbox agent", async () => {
    const { filesystem } = await buildNonSandboxCopilotWorkspace();

    await filesystem.writeFile("/home/notes.md", "hello home");
    expect(
      await filesystem.readFile("/home/notes.md", { encoding: "utf-8" })
    ).toBe("hello home");

    expect(
      readFileSync(
        join(
          localRoot,
          "tenants",
          TENANT_ID,
          "ai",
          "workspace",
          "users",
          USER_ID,
          "notes.md"
        ),
        "utf-8"
      )
    ).toBe("hello home");
  });

  it("keeps /skills read-only (writes rejected)", async () => {
    const { filesystem } = await buildNonSandboxCopilotWorkspace();

    await expect(
      filesystem.writeFile("/skills/nope.txt", "should fail")
    ).rejects.toThrow();
  });
});
