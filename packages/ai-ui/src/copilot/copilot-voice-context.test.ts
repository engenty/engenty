import type { AgentUiStateSnapshotV1 } from "@engenty/ag-ui-bridge";
import { describe, expect, it } from "vitest";
import { formatCopilotVoiceUiStateInstructions } from "./copilot-voice-context.js";

function makeSnapshot(
  overrides: Partial<AgentUiStateSnapshotV1> = {}
): AgentUiStateSnapshotV1 {
  return {
    observed_at: "2026-08-21T00:00:00.000Z",
    route: {
      module_id: "projects",
      pathname: "/s/acme/projects",
      route_key: "list",
    },
    sequence: 1,
    shell: { copilot_open: true },
    snapshot_id: "snap-voice-1",
    version: 1,
    ...overrides,
  };
}

describe("formatCopilotVoiceUiStateInstructions", () => {
  it("uses the text harness instead of a smaller hand-written snapshot", () => {
    const text = formatCopilotVoiceUiStateInstructions(makeSnapshot());
    expect(text).toContain(
      "Current app UI state (AG-UI snapshot from the host — authoritative for route and selection; not the browser address bar):"
    );
    expect(text).toContain("pathname: /s/acme/projects");
    expect(text).toContain("space_key: acme");
    expect(text).toContain("page_module: projects");
    expect(text).toContain("copilot_open: true");
    expect(text).toContain("## App navigation paths (canonical)");
    expect(text).toContain("`/s/<space_key>/copilot`");
    expect(text).toContain("do not assume `moduleId === segment`");
  });

  it("still sends canonical Space paths when the host has no snapshot", () => {
    const text = formatCopilotVoiceUiStateInstructions(null);
    expect(text).toContain("## App navigation paths (canonical)");
    expect(text).toContain("`/s/<space_key>/data`");
    expect(text).not.toContain("pathname:");
  });

  it("passes mounted-module app context through the same harness as text", () => {
    const text = formatCopilotVoiceUiStateInstructions(
      makeSnapshot({
        app_context: [
          {
            description: "space_mounted_modules",
            value: "projects (write, space), contacts (read, tenant_shared)",
          },
        ],
      })
    );
    expect(text).toContain("space_key: acme");
    expect(text).toContain("space_mounted_modules");
    expect(text).toContain(
      "projects (write, space), contacts (read, tenant_shared)"
    );
  });
});
