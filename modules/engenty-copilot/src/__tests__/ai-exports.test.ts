import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { getCopilotBaseFrontendTools } from "../../ai/frontend-tools/index.js";
import {
  runNavigateFrontendTool,
  useRegisterCopilotFrontendTools,
} from "../../ai/frontend-tools/register-all.js";
import {
  ENGENTY_CATALOG_TOOL_IDS,
  ENGENTY_COPILOT_AGENT_ID,
  ENGENTY_COPILOT_MANAGED_SKILLS,
  ENGENTY_COPILOT_TOOL_IDS,
  ENGENTY_INSTRUCTIONS,
  ENGENTY_VAULT_TOOL_IDS,
  engentyCopilotAgentConfig,
} from "../../ai/index.js";

describe("@engenty/engenty-copilot AI exports", () => {
  it("exports the built-in Copilot agent", () => {
    expect(ENGENTY_COPILOT_AGENT_ID).toBe("engenty.copilot");
    expect(engentyCopilotAgentConfig.id).toBe("engenty.copilot");
    expect(engentyCopilotAgentConfig.subAgents).toEqual([
      { alias: "engenty_cli", id: "engenty.cli" },
      { alias: "file_analyst", id: "engenty.file-analyst" },
      { alias: "app_coder", id: "engenty.app-coder" },
    ]);
  });

  it("attaches catalog and vault tools directly to the copilot", () => {
    expect(ENGENTY_COPILOT_TOOL_IDS).toEqual(
      expect.arrayContaining([
        ...ENGENTY_CATALOG_TOOL_IDS,
        ...ENGENTY_VAULT_TOOL_IDS,
        "cleanup_csv",
        "skills_find",
        "skills_install",
      ])
    );
    expect(engentyCopilotAgentConfig.toolIds).toContain("engenty_tool_execute");
    expect(engentyCopilotAgentConfig.toolIds).toContain("cleanup_csv");
  });

  it("keeps live delegation in runtime and manifest tool sets", () => {
    expect(ENGENTY_COPILOT_TOOL_IDS).toEqual(
      expect.arrayContaining(["registry_agents_list", "message_agent"])
    );
    expect(engentyCopilotAgentConfig.toolIds).toEqual(
      expect.arrayContaining(["registry_agents_list", "message_agent"])
    );
    const manifest = JSON.parse(
      readFileSync(
        new URL("../../ai/agents/engenty.copilot/agent.json", import.meta.url),
        "utf8"
      )
    ) as { tools?: string[] };
    expect(manifest.tools).toEqual(
      expect.arrayContaining(["registry_agents_list", "message_agent"])
    );
  });

  it("exports the Copilot base frontend tool catalog", () => {
    expect(getCopilotBaseFrontendTools().map((tool) => tool.name)).toEqual([
      "navigate",
      "shell_set_theme",
      "i18n_set_locale",
      "openCopilot",
      "closeCopilot",
      "setCopilotDockMode",
      "openDialog",
      "focusField",
      "show_ui_guide",
    ]);
  });

  it("exports browser registration helpers from the Copilot module", () => {
    expect(useRegisterCopilotFrontendTools).toEqual(expect.any(Function));
  });

  it("registers copilot product playbooks, not platform runtime skills", () => {
    expect(Object.keys(ENGENTY_COPILOT_MANAGED_SKILLS).sort()).toEqual([
      "durable-work",
      "hire-agent",
      "space-data",
      "space-setup",
      "work-routing",
    ]);
  });

  it("does not expose a working-memory write tool", () => {
    // The profile is read-only to the model (`agentManaged: false` drops
    // `updateWorkingMemory`). The Observer maintains it outside the tool loop.
    expect(ENGENTY_INSTRUCTIONS).not.toMatch(
      /call \*\*updateWorkingMemory\*\*/
    );
  });

  it("attaches the Copilot-owned work skills consistently", () => {
    const manifest = JSON.parse(
      readFileSync(
        new URL("../../ai/agents/engenty.copilot/agent.json", import.meta.url),
        "utf8"
      )
    ) as { skills?: string[] };
    expect(engentyCopilotAgentConfig.skillIds).toEqual([
      "work-routing",
      "hire-agent",
      "durable-work",
      "space-data",
      "space-setup",
    ]);
    expect(manifest.skills).toEqual(engentyCopilotAgentConfig.skillIds);

    const router = ENGENTY_COPILOT_MANAGED_SKILLS["work-routing"];
    expect(router).toContain("`message_agent` to a mounted Engenty");
    expect(router).toContain("Load **hire-agent**");
    expect(router).toContain("Load **durable-work**");

    const hire = ENGENTY_COPILOT_MANAGED_SKILLS["hire-agent"];
    expect(hire).toContain("Call `registry_agents_list` in this turn");
    expect(hire).toContain("`for_work`: `routine`");
    expect(hire).toContain("`routines_create`");
    expect(hire).toContain("reusing an existing id make it a gated proposal");

    const durable = ENGENTY_COPILOT_MANAGED_SKILLS["durable-work"];
    expect(durable).toContain("Call `registry_agents_list` in this turn");
    expect(durable).toContain('Default `status: "todo"` IS the kickoff');
    expect(durable).toContain("invent `tasks_dispatch`");
  });

  it("routes durable multi-Task work through Tasks, not a planning record", () => {
    // An outcome too big for one Task becomes several Tasks with real
    // dependencies; nothing plans on the Copilot's behalf.
    const durable = ENGENTY_COPILOT_MANAGED_SKILLS["durable-work"];
    expect(durable).toContain("blocked_by_task_ids");
    expect(durable).not.toMatch(/goals?_\w+/);
    expect(ENGENTY_COPILOT_MANAGED_SKILLS["work-routing"]).not.toMatch(
      /goals?_\w+/
    );
    expect(ENGENTY_INSTRUCTIONS).not.toMatch(/goals?_\w+/);
  });

  it("keeps live and durable Copilot starters distinct", () => {
    const manifest = JSON.parse(
      readFileSync(
        new URL("../../ai/agents/engenty.copilot/agent.json", import.meta.url),
        "utf8"
      )
    ) as {
      starters?: Array<{ id: string; prompt: string }>;
    };
    const live = manifest.starters?.find(
      (starter) => starter.id === "copilot-ask-live"
    );
    const durable = manifest.starters?.find(
      (starter) => starter.id === "copilot-assign-durable"
    );
    expect(live?.prompt).toContain("Keep this live");
    expect(live?.prompt).toContain("do not create a Task");
    expect(durable?.prompt).toContain("Create one Task");
    expect(durable?.prompt).toContain("survives this chat");
  });

  it("keeps AGENTS.md free of personal-data examples", () => {
    expect(ENGENTY_INSTRUCTIONS).not.toMatch(/@[\w.-]+\.\w+/);
  });

  it("points at the injected Space contract instead of duplicating it", () => {
    expect(ENGENTY_INSTRUCTIONS).toMatch(/## Spaces/);
    expect(ENGENTY_INSTRUCTIONS).toMatch(
      /injected runtime `## Space contract`/
    );
    expect(ENGENTY_INSTRUCTIONS).not.toMatch(
      /engenty_tools_modules.*return catalog contracts, not records/
    );
  });

  it("documents Space-confined sandbox mount semantics in the copilot space-data skill", () => {
    const skill = ENGENTY_COPILOT_MANAGED_SKILLS["space-data"];
    expect(skill).toContain("Artifacts");
  });
});

describe("runNavigateFrontendTool", () => {
  it("navigates to an internal path", () => {
    const navigate = vi.fn();
    const result = runNavigateFrontendTool({ to: "/contacts" }, navigate);
    // The result names where it landed so the agent can report it accurately.
    expect(result).toEqual({ ok: true, to: "/contacts" });
    expect(navigate).toHaveBeenCalledWith("/contacts", { replace: false });
  });

  it("can notify the shell to keep copilot open after navigation", () => {
    const navigate = vi.fn();
    const onNavigate = vi.fn();
    const result = runNavigateFrontendTool({ to: "/contacts" }, navigate, {
      onNavigate,
    });
    expect(result).toEqual({ ok: true, to: "/contacts" });
    expect(navigate).toHaveBeenCalledWith("/contacts", { replace: false });
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("passes replace when true", () => {
    const navigate = vi.fn();
    runNavigateFrontendTool({ to: "/chat", replace: true }, navigate);
    expect(navigate).toHaveBeenCalledWith("/chat", { replace: true });
  });

  it("rejects non-internal paths", () => {
    const navigate = vi.fn();
    expect(() =>
      runNavigateFrontendTool({ to: "https://evil.example/" }, navigate)
    ).toThrow("Only internal application paths are allowed.");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("rejects protocol-relative paths", () => {
    const navigate = vi.fn();
    expect(() =>
      runNavigateFrontendTool({ to: "//evil.example/" }, navigate)
    ).toThrow("Only internal application paths are allowed.");
    expect(navigate).not.toHaveBeenCalled();
  });
});
