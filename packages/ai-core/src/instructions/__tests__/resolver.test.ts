import { afterEach, describe, expect, it } from "vitest";
import type { InstructionDocumentRecord } from "../../contracts.js";
import {
  registerAiRegistration,
  unregisterAiRegistration,
} from "../../registry.js";
import {
  readCopilotAgentsMarkdown,
  readCopilotSoulMarkdown,
} from "../copilot-seed-files.js";
import {
  createEngentyCopilotInstructionDocuments,
  ENGENTY_COPILOT_AGENTS_KEY,
} from "../registry.js";
import {
  resolveCopilotPromptLayers,
  resolveInstructionLayers,
} from "../resolver.js";

function createRecord(
  input: Partial<InstructionDocumentRecord> &
    Pick<
      InstructionDocumentRecord,
      "body" | "document_key" | "id" | "layer" | "module_id" | "title"
    >
): InstructionDocumentRecord {
  return {
    body: input.body,
    created_at: input.created_at ?? "2026-03-29T00:00:00.000Z",
    created_by_user_id: input.created_by_user_id ?? null,
    document_key: input.document_key,
    id: input.id,
    is_active: input.is_active ?? true,
    layer: input.layer,
    metadata: input.metadata ?? {},
    module_id: input.module_id,
    source_kind: input.source_kind ?? "seed",
    tenant_id: input.tenant_id ?? null,
    title: input.title,
    updated_at: input.updated_at ?? "2026-03-29T00:00:00.000Z",
    updated_by_user_id: input.updated_by_user_id ?? null,
    version: input.version ?? 1,
  };
}

describe("instruction resolver", () => {
  afterEach(() => {
    unregisterAiRegistration("engenty-core");
    unregisterAiRegistration("resolver-test");
  });

  it("prefers tenant overrides and preserves layer ordering by requested keys", async () => {
    const store = {
      listActiveDocuments: async () => [
        createRecord({
          id: "module-doc",
          document_key: "contacts.module",
          layer: "module",
          module_id: "contacts",
          title: "Contacts module",
          body: "Module body",
          version: 1,
        }),
        createRecord({
          id: "agent-doc",
          document_key: "contacts.agent",
          layer: "agent",
          module_id: "contacts",
          title: "Contacts agent",
          body: "Agent seed body",
          version: 1,
        }),
        createRecord({
          id: "agent-tenant-doc",
          document_key: "contacts.agent",
          layer: "tenant_override",
          module_id: "contacts",
          title: "Contacts agent tenant override",
          body: "Agent tenant override body",
          tenant_id: "tenant-1",
          version: 3,
        }),
      ],
    };

    const resolved = await resolveInstructionLayers({
      moduleInstructionKeys: ["contacts.module"],
      agentInstructionKeys: ["contacts.agent"],
      store,
      tenantId: "tenant-1",
    });

    expect(resolved.documents.map((document) => document.body)).toEqual([
      "Module body",
      "Agent tenant override body",
    ]);
    expect(resolved.text).toBe("Module body\n\nAgent tenant override body");
  });

  it("falls back to copilot markdown files when no store is configured", async () => {
    registerAiRegistration({
      instruction_documents: createEngentyCopilotInstructionDocuments(),
      module_id: "engenty-core",
    });

    const resolved = await resolveCopilotPromptLayers();

    expect(resolved.agentsPrompt).toBe(readCopilotAgentsMarkdown());
    expect(resolved.soulPrompt).toBe(readCopilotSoulMarkdown());
  });

  it("prefers stored tenant instruction override for copilot AGENTS over file seed", async () => {
    registerAiRegistration({
      instruction_documents: createEngentyCopilotInstructionDocuments(),
      module_id: "engenty-core",
    });

    const store = {
      listActiveDocuments: async () => [
        createRecord({
          id: "id-tenant-agents",
          document_key: ENGENTY_COPILOT_AGENTS_KEY,
          layer: "tenant_override",
          module_id: "engenty",
          title: "Tenant agents",
          body: "TENANT_AGENTS_BODY",
          tenant_id: "tenant-1",
          version: 2,
          source_kind: "user",
        }),
      ],
    };

    const resolved = await resolveCopilotPromptLayers({
      store,
      tenantId: "tenant-1",
    });

    expect(resolved.agentsPrompt).toBe("TENANT_AGENTS_BODY");
  });

  it("resolves registered module instruction seeds without a store", async () => {
    registerAiRegistration({
      module_id: "resolver-test",
      instruction_documents: [
        {
          id: "resolver_test_agent",
          module_id: "resolver-test",
          key: "resolver_test_agent",
          title: "Resolver agent",
          default_body: "Agent instruction body.",
          layer: "agent",
        },
      ],
    });

    const resolved = await resolveInstructionLayers({
      agentInstructionKeys: ["resolver_test_agent"],
    });

    expect(resolved.documents).toHaveLength(1);
    expect(resolved.text).toBe("Agent instruction body.");
  });
});
