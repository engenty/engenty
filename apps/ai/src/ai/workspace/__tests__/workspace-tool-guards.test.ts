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

  it("asks when the run holds no grant", () => {
    expect(gate({ args: { command: "python script.py" } })).toBe(true);
  });

  it("does not ask when the run's grants cover this exact command", () => {
    // A routine's standing allow-list or an agent grant lands here. Without
    // this the schedule would gate, park for a human who is not there, and
    // gate again on the next fire — forever.
    const granted = engentyToolsRunAls.run(
      { approvalGrants: [`workspace:${TOOL}:python script.py`] } as never,
      () => gate({ args: { command: "python script.py" } })
    );
    expect(granted).toBe(false);
  });

  it("asks again for a different command", () => {
    const other = engentyToolsRunAls.run(
      { approvalGrants: [`workspace:${TOOL}:python script.py`] } as never,
      () => gate({ args: { command: "rm -rf /" } })
    );
    expect(other).toBe(true);
  });

  it("is not satisfied by a tool-wide grant", () => {
    const toolWide = engentyToolsRunAls.run(
      { approvalGrants: [`workspace:${TOOL}`] } as never,
      () => gate({ args: { command: "python script.py" } })
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
    ).toBe("Publish to the company");
  });
});
