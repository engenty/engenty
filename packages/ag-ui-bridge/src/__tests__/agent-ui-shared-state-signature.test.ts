import { describe, expect, it } from "vitest";
import {
  agentUiBaseShellSignature,
  agentUiSharedStateSignature,
} from "../index.js";

describe("agentUi shared state signatures", () => {
  const base = {
    route: {
      module_id: "engenty-copilot",
      pathname: "/mdl/team/m1",
      route_key: "chat",
    },
    selection: { entity_id: "m1", entity_type: "team" },
    shell: { copilot_open: true, dock_mode: "sidebar" as const },
  };

  it("changes base signature when pathname changes", () => {
    const a = agentUiBaseShellSignature(base);
    const b = agentUiBaseShellSignature({
      ...base,
      route: { ...base.route, pathname: "/mdl/contacts/c1" },
    });
    expect(a).not.toBe(b);
  });

  it("changes shared signature when sequence bumps after navigation", () => {
    const before = agentUiSharedStateSignature({
      ...base,
      sequence: 4,
    });
    const after = agentUiSharedStateSignature({
      ...base,
      route: { ...base.route, pathname: "/mdl/tasks/t1" },
      sequence: 5,
    });
    expect(before).not.toBe(after);
  });
});
