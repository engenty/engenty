import { describe, expect, it, vi } from "vitest";
import { getCopilotBaseFrontendTools } from "../../ai/frontend-tools/index.js";
import {
  runNavigateFrontendTool,
  runOfferFileDownloadsFrontendTool,
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
    ]);
  });

  it("attaches catalog and vault tools directly to the copilot", () => {
    expect(ENGENTY_COPILOT_TOOL_IDS).toEqual(
      expect.arrayContaining([
        ...ENGENTY_CATALOG_TOOL_IDS,
        ...ENGENTY_VAULT_TOOL_IDS,
        "cleanup_csv",
      ])
    );
    expect(engentyCopilotAgentConfig.toolIds).toContain("engenty_tool_execute");
    expect(engentyCopilotAgentConfig.toolIds).toContain("cleanup_csv");
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
      "offer_file_downloads",
      "show_artifact",
    ]);
  });

  it("exports browser registration helpers from the Copilot module", () => {
    expect(useRegisterCopilotFrontendTools).toEqual(expect.any(Function));
  });

  it("advertises the real Files module route (mounted under the admin shell)", () => {
    // The Files module registers its routes/menu at /admin/files (see
    // modules/files/ui/plugin.ts), not the generic /mdl/<name> pattern.
    expect(ENGENTY_INSTRUCTIONS).toContain("/admin/files");
    expect(ENGENTY_INSTRUCTIONS).not.toContain("/mdl/files");
  });

  it("instructs the copilot to persist durable user facts via updateWorkingMemory", () => {
    expect(ENGENTY_INSTRUCTIONS).toContain("updateWorkingMemory");
    expect(ENGENTY_INSTRUCTIONS).toContain("preferred_language");
  });
});

describe("runNavigateFrontendTool", () => {
  it("navigates to an internal path", () => {
    const navigate = vi.fn();
    const result = runNavigateFrontendTool({ to: "/contacts" }, navigate);
    expect(result).toEqual({ ok: true });
    expect(navigate).toHaveBeenCalledWith("/contacts", { replace: false });
  });

  it("can notify the shell to keep copilot open after navigation", () => {
    const navigate = vi.fn();
    const onNavigate = vi.fn();
    const result = runNavigateFrontendTool({ to: "/contacts" }, navigate, {
      onNavigate,
    });
    expect(result).toEqual({ ok: true });
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

describe("runOfferFileDownloadsFrontendTool", () => {
  it("normalizes offered files from storage keys", () => {
    expect(
      runOfferFileDownloadsFrontendTool({
        files: [
          {
            key: "tenants/t1/ai/workspace/reports/summary.csv",
            mime_type: "text/csv",
          },
        ],
      })
    ).toEqual({
      ok: true,
      __type: "file_downloads",
      files: [
        {
          key: "tenants/t1/ai/workspace/reports/summary.csv",
          mime_type: "text/csv",
          name: "summary.csv",
        },
      ],
    });
  });

  it("requires at least one file key", () => {
    expect(() => runOfferFileDownloadsFrontendTool({ files: [] })).toThrow(
      /requires input/
    );
  });
});
