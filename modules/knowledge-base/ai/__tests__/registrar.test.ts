import { unregisterAiRegistration } from "@engenty/ai-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  knowledgeBaseAiRegistration,
  knowledgeBaseDynamicAiCapability,
} from "../registrar.js";

describe("knowledgeBaseAiRegistration", () => {
  const noopInvoke = async () => null;

  afterEach(() => {
    unregisterAiRegistration("knowledge-base");
  });

  it("loads actions, skills, agent, and trigger for the knowledge-base module", () => {
    const reg = knowledgeBaseAiRegistration({
      invokeKbOperation: noopInvoke,
    });
    expect(reg.module_id).toBe("knowledge-base");
    expect(reg.actions?.length).toBeGreaterThanOrEqual(6);
    expect(reg.skills?.length).toBeGreaterThanOrEqual(7);

    const actionIds = new Set(reg.actions?.map((a) => a.id) ?? []);
    expect(actionIds.has("knowledge-base.capture-source")).toBe(true);
    expect(actionIds.has("knowledge-base.triage-inbox")).toBe(true);
    expect(actionIds.has("knowledge-base.promote-inbox-item")).toBe(true);
    expect(actionIds.has("knowledge-base.promote-inbox-batch")).toBe(true);
    expect(actionIds.has("knowledge-base.lint-knowledge-base")).toBe(true);
    expect(actionIds.has("knowledge-base.file-answer")).toBe(true);

    const skillNames = new Set(reg.skills?.map((s) => s.name) ?? []);
    expect(skillNames.has("kb-agentic-source-ingest")).toBe(true);
    expect(skillNames.has("kb-article-content-management")).toBe(true);
    expect(skillNames.has("kb-faq-content-management")).toBe(true);
    expect(skillNames.has("kb-search-and-retrieve")).toBe(true);
    expect(skillNames.has("kb-ingest")).toBe(true);
    expect(skillNames.has("kb-maintenance")).toBe(true);
    expect(skillNames.has("kb-source-manager")).toBe(true);

    expect(reg.instruction_documents?.length).toBeGreaterThanOrEqual(1);
    expect(
      reg.instruction_documents?.some(
        (d) => d.key === "knowledge_base_manager_agents"
      )
    ).toBe(true);

    const agent = reg.agents?.find((a) => a.id === "knowledge-base.manager");
    expect(agent).toBeTruthy();
    expect(agent?.instruction_keys).toContain("knowledge_base_manager_agents");
    const dynamicIds = reg.dynamic?.agent_configs?.map((c) => c.id) ?? [];
    expect(dynamicIds).toContain("knowledge-base.manager");
    expect(dynamicIds).toContain("knowledge-base.answers");
    // research-assistant removed (workforce plan R1)
    expect(dynamicIds).not.toContain("knowledge-base.research-assistant");
    expect(Object.keys(reg.dynamic?.skills ?? {})).toContain(
      "kb-search-and-retrieve"
    );

    const trigger = reg.triggers?.find(
      (t) => t.id === "knowledge_base_ingest_trigger"
    );
    expect(trigger?.routeKey).toBe("enhance");
  });

  it("knowledge-base.answers agent config has read_only_kb profile and scoped tools", () => {
    const reg = knowledgeBaseAiRegistration({
      invokeKbOperation: noopInvoke,
    });
    const answersConfig = reg.dynamic?.agent_configs?.find(
      (c) => c.id === "knowledge-base.answers"
    );
    expect(answersConfig).toBeTruthy();
    expect(answersConfig?.tool_profile).toBe("read_only_kb");
    expect(answersConfig?.toolIds).toEqual(
      expect.arrayContaining(["knowledge_base_article_search", "kb_faqs_list"])
    );
    expect(answersConfig?.skillIds).toContain("kb-search-and-retrieve");
    // answers agent must not carry write/catalog tools
    expect(answersConfig?.toolIds).not.toContain("engenty_tools_search");
    expect(answersConfig?.toolIds).not.toContain("engenty_tool_execute");
    expect(answersConfig?.toolIds).not.toContain("web_search");
  });

  it("exposes only knowledge-base manager as dynamic module capability (workforce plan R1)", () => {
    const invokeKbOperation = vi.fn(async () => null);
    const capability = knowledgeBaseDynamicAiCapability({ invokeKbOperation });

    expect(capability.moduleId).toBe("knowledge-base");
    const configIds = capability.agentConfigs?.map((c) => c.id) ?? [];
    expect(configIds).toContain("knowledge-base.manager");
    expect(configIds).not.toContain("knowledge-base.research-assistant");

    const managerConfig = capability.agentConfigs?.find(
      (c) => c.id === "knowledge-base.manager"
    );
    expect(managerConfig).toMatchObject({
      id: "knowledge-base.manager",
      skillIds: expect.arrayContaining([
        "kb-agentic-source-ingest",
        "kb-article-content-management",
        "kb-faq-content-management",
        "kb-ingest",
        "kb-maintenance",
        "kb-search-and-retrieve",
        "kb-source-manager",
      ]),
      source: "module",
      toolIds: [
        "engenty_tools_search",
        "engenty_tool_execute",
        "web_search",
        "memory_save",
        "memory_record_search",
        "memory_record_archive",
      ],
    });

    expect(managerConfig?.instructions).toContain(
      "engenty_tools_search` searches the tool catalog only"
    );
    expect(Object.keys(capability.skills ?? {}).sort()).toEqual([
      "kb-agentic-source-ingest",
      "kb-article-content-management",
      "kb-faq-content-management",
      "kb-ingest",
      "kb-maintenance",
      "kb-search-and-retrieve",
      "kb-source-manager",
      "kb-structure-management",
    ]);
    expect(capability.tools).not.toHaveProperty("web_search");
    expect(capability.tools).not.toHaveProperty("get-article");
    expect(capability.tools).not.toHaveProperty("search-kb");
    expect(invokeKbOperation).not.toHaveBeenCalled();
  });
});
