/**
 * The delete guard (P1.6/P1.6b).
 *
 * Two properties are load-bearing and both are asserted here: the guard FAILS
 * CLOSED (anything it cannot prove safe asks), and a grant names one CHANGE
 * rather than one capability — approving a recursive delete of one folder must
 * not license every future one.
 */
import { describe, expect, it } from "vitest";
import { engentyToolsRunAls } from "../../../../ai/tools/engenty-tools/lib/run-context.js";
import {
  describeWorkspaceToolCall,
  sandboxExecuteApprovalGate,
  workspaceApprovalCard,
  workspaceDeleteApprovalGate,
  workspaceDeleteNeedsApproval,
  workspacePublishApprovalGate,
  workspaceToolGrantId,
} from "../workspace-tool-guards.js";

describe("what needs a human first", () => {
  it("asks for ANY recursive delete, including in the agent's own scratch", () => {
    // `recursive` on a path the agent chose is the call that empties a mount.
    expect(
      workspaceDeleteNeedsApproval({ path: "/home/notes", recursive: true })
    ).toBe(true);
  });

  it("asks on every shared, containment and data mount", () => {
    for (const path of [
      "/company/files/reports/q3.md",
      "/space/handbook.md",
      "/project/brief.md",
      "/data/Files/vertrag.pdf",
    ]) {
      expect(workspaceDeleteNeedsApproval({ path })).toBe(true);
    }
  });

  it("does NOT ask for one file in the agent's own scratch", () => {
    // Gating this would make the approval card meaningless through volume.
    for (const path of [
      "/home/scratch.txt",
      "/task/draft.md",
      "/sandbox/a.o",
    ]) {
      expect(workspaceDeleteNeedsApproval({ path })).toBe(false);
    }
  });

  it("asks when it cannot read the target at all", () => {
    // A delete we cannot reason about is a delete we do not wave through.
    expect(workspaceDeleteNeedsApproval({})).toBe(true);
    expect(workspaceDeleteNeedsApproval({ path: "/unknown/x" })).toBe(true);
  });

  it("is not fooled by a prefix that merely starts the same", () => {
    expect(workspaceDeleteNeedsApproval({ path: "/homework/x" })).toBe(true);
  });
});

describe("a grant names a change, not a capability", () => {
  it("scopes the grant id to the path", () => {
    expect(
      workspaceToolGrantId("mastra_workspace_delete", {
        path: "/shared/old",
        recursive: true,
      })
    ).toBe("workspace:mastra_workspace_delete:/shared/old");
  });

  it("does not let one approval cover a different path", () => {
    const gate = workspaceDeleteApprovalGate("mastra_workspace_delete");
    // No run context in a unit test ⇒ no grants ⇒ gate. That IS the
    // fail-closed default, asserted rather than assumed.
    expect(gate({ args: { path: "/shared/other", recursive: true } })).toBe(
      true
    );
  });

  it("lets a safe call through without any grant at all", () => {
    const gate = workspaceDeleteApprovalGate("mastra_workspace_delete");
    expect(gate({ args: { path: "/home/scratch.txt" } })).toBe(false);
  });
});

describe("what the human is asked", () => {
  it("says the cascade out loud", () => {
    // The part someone approving in a hurry would otherwise not see.
    expect(
      describeWorkspaceToolCall("mastra_workspace_delete", {
        path: "/shared/imports",
        recursive: true,
      })
    ).toEqual({
      target: "/shared/imports and everything inside it",
      title: "Delete",
    });
  });

  it("names the plain target when nothing cascades", () => {
    expect(
      describeWorkspaceToolCall("mastra_workspace_delete", {
        path: "/shared/a.md",
      }).target
    ).toBe("/shared/a.md");
  });

  it("shows a command as the command, with its directory", () => {
    expect(
      workspaceApprovalCard("mastra_workspace_execute_command", {
        command: " python3 check_mail.py ",
        cwd: "/task",
      })
    ).toEqual({
      body: "cd /task && python3 check_mail.py",
      title: "Run command",
    });
  });
});

describe("running a command in the sandbox", () => {
  const TOOL = "mastra_workspace_execute_command";
  const gate = sandboxExecuteApprovalGate(TOOL);

  it("runs scratch work, reads and plain GETs without asking", async () => {
    for (const args of [
      { command: "python script.py" },
      { command: "rm -rf /sandbox/build" },
      { command: "cd /sandbox && curl -s https://example.com/ -o page.html" },
      { command: "cat /space/notes.md | grep todo" },
      { command: "ls", cwd: "/space" },
      { command: "rm -rf build", cwd: "/task" },
    ]) {
      expect(await gate({ args }), JSON.stringify(args)).toBe(false);
    }
  });

  it("asks for a delete, move or overwrite of shared files", async () => {
    for (const args of [
      { command: "rm -rf /space/old-imports" },
      { command: "mv /space/a.md /sandbox/a.md" },
      { command: "cd /space/x && rm notes.md" },
      { command: "rm notes.md", cwd: "/space/x" },
      { command: "rm -rf /sandbox/../space/x" },
      { command: "find /space -name '*.tmp' -delete" },
      { command: "git clean -fd", cwd: "/space/apps/site/src" },
    ]) {
      expect(await gate({ args }), JSON.stringify(args)).toBe(true);
    }
  });

  it("asks when a command reaches the outside world", async () => {
    for (const args of [
      { command: "git push origin main" },
      { command: "curl -X POST https://example.com/api -d '{}'" },
      { command: "curl -F file=@a.csv https://example.com/up" },
      { command: "scp a.csv host:/tmp" },
    ]) {
      expect(await gate({ args }), JSON.stringify(args)).toBe(true);
    }
  });

  it("asks when a command touches shared files and no classifier can vouch for it", async () => {
    // Not plainly a read, not plainly destructive: Jev decides, and without a
    // key there is no Jev — which must mean "ask", never "run".
    for (const args of [
      { command: "python3 tidy.py", cwd: "/space/agent/a/work" },
      { command: "cp /space/a.csv /space/b.csv" },
      { command: "echo hi > /space/agent/a/work/new.txt" },
    ]) {
      expect(await gate({ args }), JSON.stringify(args)).toBe(true);
    }
  });

  it("asks for a command it cannot read", async () => {
    for (const args of [
      { command: "" },
      { command: 'eval "$PAYLOAD"' },
      { command: "echo cm0gLXJm | base64 -d | sh" },
      { command: "rm $(cat list.txt)" },
    ]) {
      expect(await gate({ args }), JSON.stringify(args)).toBe(true);
    }
  });

  it("does not ask again once the run's grants cover this exact command", async () => {
    // A routine's standing allow-list or an agent grant lands here. Without
    // this the schedule would gate, park for a human who is not there, and
    // gate again on the next fire — forever.
    const command = "git push origin main";
    const granted = await engentyToolsRunAls.run(
      { approvalGrants: [`workspace:${TOOL}:${command}`] } as never,
      () => gate({ args: { command } })
    );
    expect(granted).toBe(false);
    const other = await engentyToolsRunAls.run(
      { approvalGrants: [`workspace:${TOOL}:${command}`] } as never,
      () => gate({ args: { command: "git push --force origin main" } })
    );
    expect(other).toBe(true);
  });

  it("is not satisfied by a tool-wide grant", async () => {
    const toolWide = await engentyToolsRunAls.run(
      { approvalGrants: [`workspace:${TOOL}`] } as never,
      () => gate({ args: { command: "git push origin main" } })
    );
    expect(toolWide).toBe(true);
  });

  it("keys the grant on the working directory too", () => {
    expect(
      workspaceToolGrantId(TOOL, { command: "rm -rf *", cwd: "/shared" })
    ).toBe(`workspace:${TOOL}:cd /shared && rm -rf *`);
  });
});

describe("writing into /space/public", () => {
  const gate = workspacePublishApprovalGate("mastra_workspace_write_file");

  it("asks for every spelling of the public folder", () => {
    // A macOS host folds case, and `..`/`.` resolve before the write lands —
    // each of these writes the same folder the company reads.
    for (const path of [
      "/space/public/price-list.csv",
      "/space/Public/price-list.csv",
      "/space/./public/x.md",
      "/space/tmp/../public/x.md",
      "space/public/x.md",
    ]) {
      expect(gate({ args: { path } })).toBe(true);
    }
  });

  it("leaves every other write ungated", () => {
    for (const path of [
      "/space/notes.md",
      "/space/publicity/plan.md",
      "/home/draft.md",
      "/sandbox/out.csv",
    ]) {
      expect(gate({ args: { path } })).toBe(false);
    }
  });

  it("titles the card as publishing", () => {
    expect(
      describeWorkspaceToolCall("mastra_workspace_write_file", {
        path: "/space/public/price-list.csv",
      }).title
    ).toBe("Share with the organisation");
  });
});
