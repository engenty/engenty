import { describe, expect, it } from "vitest";
import type { AiInstructionDocument } from "../../lib/admin/instruction-settings-api";
import {
  hasInstructionOverride,
  instructionOverrideFlagsByKey,
} from "./instruction-groups";

function document(
  overrides: Partial<AiInstructionDocument> &
    Pick<AiInstructionDocument, "document_key" | "layer">
): AiInstructionDocument {
  return {
    body: "",
    created_at: "2026-01-01T00:00:00.000Z",
    created_by_user_id: null,
    id: overrides.document_key,
    is_active: true,
    metadata: {},
    module_id: "engenty",
    source_kind: "seed",
    tenant_id: null,
    title: overrides.document_key,
    updated_at: "2026-01-01T00:00:00.000Z",
    updated_by_user_id: null,
    version: 1,
    ...overrides,
  };
}

describe("instructionOverrideFlagsByKey", () => {
  it("marks tenant and user overrides per document key", () => {
    const flags = instructionOverrideFlagsByKey([
      document({ document_key: "agent.agents", layer: "agent" }),
      document({ document_key: "agent.agents", layer: "tenant_override" }),
      document({ document_key: "agent.soul", layer: "user_override" }),
    ]);

    expect(flags.get("agent.agents")).toEqual({ tenant: true, user: false });
    expect(flags.get("agent.soul")).toEqual({ tenant: false, user: true });
    expect(hasInstructionOverride(flags.get("agent.agents"))).toBe(true);
    expect(hasInstructionOverride(flags.get("agent.soul"))).toBe(true);
  });

  it("returns empty flags when only seed documents exist", () => {
    const flags = instructionOverrideFlagsByKey([
      document({ document_key: "agent.agents", layer: "agent" }),
    ]);

    expect(flags.get("agent.agents")).toEqual({ tenant: false, user: false });
    expect(hasInstructionOverride(flags.get("agent.agents"))).toBe(false);
  });
});
