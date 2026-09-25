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
      "setCopilotDockMode",
      "openDialog",
      "focusField",
      "show_ui_guide",
    ]);
  });

  it("exports browser registration helpers from the Copilot module", () => {
    expect(useRegisterCopilotFrontendTools).toEqual(expect.any(Function));
  });

  it("does not expose a working-memory write tool", () => {
    // The profile is read-only to the model (`agentManaged: false` drops
    // `updateWorkingMemory`). The Observer maintains it outside the tool loop.
    expect(ENGENTY_INSTRUCTIONS).not.toMatch(
      /call \*\*updateWorkingMemory\*\*/
    );
  });

  it("prefers the Space playbooks from the skill library by name", () => {
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
      "routines",
      "space-data",
      "space-setup",
      "getting-started",
    ]);
    expect(manifest.skills).toEqual(engentyCopilotAgentConfig.skillIds);
  });

  it("routes durable multi-Task work through Tasks, not a planning record", () => {
    // The lane skills live in @engenty/ai-skills (spaces category) and are
    // asserted there; the copilot's own instructions must not reintroduce a
    // planning noun on their side.
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

  it("leaves the Space contract to the runtime instead of duplicating it", () => {
    // Root agents get the canonical contract appended at assembly time.
    expect(ENGENTY_INSTRUCTIONS).not.toMatch(/## Space contract/);
    expect(ENGENTY_INSTRUCTIONS).not.toMatch(
      /return catalog contracts, not records/
    );
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
