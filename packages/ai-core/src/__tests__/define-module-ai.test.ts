import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defineModuleAi } from "../define-module-ai.js";

const tempDirs: string[] = [];

function makeModuleAiDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "module-ai-"));
  tempDirs.push(dir);
  for (const [relPath, content] of Object.entries(files)) {
    const filePath = join(dir, relPath);
    mkdirSync(join(filePath, ".."), { recursive: true });
    writeFileSync(filePath, content);
  }
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

const MANIFEST = JSON.stringify({
  $schema: "engenty/ai-agent-manifest/v1",
  id: "demo.manager",
  name: "Demo Manager",
  description: "Manages demos.",
  module_id: "demo",
  skills: ["demo-search"],
  tools: ["engenty_tools_search"],
  workspace: { enabled: true, preset: "staff" },
});

const SKILL_MD = `---
name: demo-search
description: Search demos.
---

# demo-search

Search demos with filters.
`;

const ACTION_MD = `---
id: demo.refresh
agent_id: demo.manager
name: Refresh demo
default_thread_mode: new
input_schema_json:
  type: object
  properties: {}
---

Refresh the demo data.
`;

const ROUTINE_MD = `---
id: demo.nightly
name: Nightly demo
schedule: "0 2 * * *"
target:
  kind: action
  action_id: demo.refresh
---
`;

function fullTree(): string {
  return makeModuleAiDir({
    "agents/demo.manager/agent.json": MANIFEST,
    "agents/demo.manager/AGENTS.md": "You are the Demo Manager.",
    "agents/demo.manager/SOUL.md": "Be cheerful.",
    "skills/demo-search/SKILL.md": SKILL_MD,
    "actions/refresh/ACTION.md": ACTION_MD,
    "routines/nightly/ROUTINE.md": ROUTINE_MD,
  });
}

describe("defineModuleAi", () => {
  it("scans the full conventional tree into both payloads", () => {
    const moduleAi = defineModuleAi({ dir: fullTree(), moduleId: "demo" });

    const registration = moduleAi.aiRegistration();
    expect(registration.module_id).toBe("demo");
    expect(registration.dynamic?.agent_configs).toHaveLength(1);
    const config = registration.dynamic?.agent_configs?.[0];
    expect(config).toMatchObject({
      id: "demo.manager",
      name: "Demo Manager",
      skillIds: ["demo-search"],
      source: "module",
      toolIds: ["engenty_tools_search"],
      workspace: expect.objectContaining({ preset: "staff" }),
    });
    expect(config?.instructions).toContain("You are the Demo Manager.");
    expect(config?.instructions).toContain("Be cheerful.");
    expect(registration.skills?.map((s) => s.name)).toEqual(["demo-search"]);
    expect(registration.actions?.map((a) => a.id)).toEqual(["demo.refresh"]);
    expect(registration.routines?.map((r) => r.id)).toEqual(["demo.nightly"]);
    expect(registration.dynamic?.skills?.["demo-search"]).toContain(
      "Search demos with filters."
    );

    const capability = moduleAi.dynamicCapability();
    expect(capability.moduleId).toBe("demo");
    expect(capability.agentConfigs?.[0]?.id).toBe("demo.manager");
    // Actions/routines ride the capability channel in serializable form.
    expect(capability.actions?.map((a) => a.id)).toEqual(["demo.refresh"]);
    expect(capability.actions?.[0]).not.toHaveProperty("input_schema");
    expect(capability.actions?.[0]?.input_schema_json).toMatchObject({
      type: "object",
    });
    expect(capability.routines?.map((r) => r.id)).toEqual(["demo.nightly"]);
    expect(() => JSON.stringify(capability.actions)).not.toThrow();
    expect(() => JSON.stringify(capability.routines)).not.toThrow();
  });

  it("merges agent overrides by id (model etc.)", () => {
    const moduleAi = defineModuleAi({
      agents: [{ id: "demo.manager", model: "openai/gpt-5-mini" }],
      dir: fullTree(),
      moduleId: "demo",
    });
    const config = moduleAi.dynamicCapability().agentConfigs?.[0];
    expect(config?.model).toBe("openai/gpt-5-mini");
    expect(config?.name).toBe("Demo Manager");
  });

  it("passes tools and agentDefinitions through", () => {
    const tool = { id: "demo_tool" };
    const moduleAi = defineModuleAi({
      agentDefinitions: () => [
        {
          build_tools: () => ({}),
          id: "demo.manager",
          instruction_keys: [],
          module_id: "demo",
          name: "Demo Manager",
        },
      ],
      dir: fullTree(),
      moduleId: "demo",
      tools: { demo_tool: tool },
    });
    expect(moduleAi.dynamicCapability().tools?.demo_tool).toBe(tool);
    expect(moduleAi.aiRegistration().agents).toHaveLength(1);
  });

  it("rejects hardcoded model ids in agent.json", () => {
    const dir = makeModuleAiDir({
      "agents/demo.manager/agent.json": JSON.stringify({
        ...JSON.parse(MANIFEST),
        model: "anthropic/claude-sonnet-4-6",
      }),
      "agents/demo.manager/AGENTS.md": "x",
    });
    expect(() =>
      defineModuleAi({ dir, moduleId: "demo" }).aiRegistration()
    ).toThrow(/must not hardcode a model id/);
  });

  it("rejects agents without AGENTS.md or instructions override", () => {
    const dir = makeModuleAiDir({
      "agents/demo.manager/agent.json": MANIFEST,
    });
    expect(() =>
      defineModuleAi({ dir, moduleId: "demo" }).aiRegistration()
    ).toThrow(/needs AGENTS.md/);
  });

  it("rejects malformed agent directory ids", () => {
    const dir = makeModuleAiDir({
      "agents/Demo_Manager/agent.json": MANIFEST,
      "agents/Demo_Manager/AGENTS.md": "x",
    });
    expect(() =>
      defineModuleAi({ dir, moduleId: "demo" }).aiRegistration()
    ).toThrow(/must match <module>\.<role>/);
  });

  it("rejects actions referencing agents outside the module by default", () => {
    const dir = makeModuleAiDir({
      "agents/demo.manager/agent.json": MANIFEST,
      "agents/demo.manager/AGENTS.md": "x",
      "actions/other/ACTION.md": ACTION_MD.replace(
        "agent_id: demo.manager",
        "agent_id: other.manager"
      ),
    });
    expect(() =>
      defineModuleAi({ dir, moduleId: "demo" }).aiRegistration()
    ).toThrow(/outside this module/);
    expect(() =>
      defineModuleAi({
        allowCrossModuleActionAgents: true,
        dir,
        moduleId: "demo",
      }).aiRegistration()
    ).not.toThrow();
  });

  it("supports the skills escape hatch (chatbot-style dynamic skills)", () => {
    const dir = makeModuleAiDir({
      "agents/demo.manager/agent.json": MANIFEST,
      "agents/demo.manager/AGENTS.md": "x",
    });
    const moduleAi = defineModuleAi({
      dir,
      moduleId: "demo",
      skillMarkdown: () => ({ "dyn-skill": "# dyn" }),
      skills: () => [{ description: "Dynamic.", name: "dyn-skill" }],
    });
    const registration = moduleAi.aiRegistration();
    expect(registration.skills?.map((s) => s.name)).toEqual(["dyn-skill"]);
    // Dynamic skill markdown is module-stamped on its way out (B4).
    expect(registration.dynamic?.skills?.["dyn-skill"]).toContain("# dyn");
    expect(registration.dynamic?.skills?.["dyn-skill"]).toMatch(
      /modules:\n\s+- demo/
    );
  });

  it("auto-stamps the owning module into skill markdown metadata (B4)", () => {
    const moduleAi = defineModuleAi({ dir: fullTree(), moduleId: "demo" });
    const markdown = moduleAi.aiRegistration().dynamic?.skills?.["demo-search"];
    expect(markdown).toMatch(/metadata:\n\s+modules:\n\s+- demo/);
    // SkillDefinition metadata carries the module via the loader default.
    const skill = moduleAi.aiRegistration().skills?.[0];
    expect(skill?.metadata?.module_id).toBe("demo");
    // Capability channel carries the same stamped markdown.
    expect(moduleAi.dynamicCapability().skills?.["demo-search"]).toContain(
      "modules:"
    );
  });

  it("preserves author-provided module tags when stamping", () => {
    const authored = `---
name: demo-search
description: Search demos.
metadata:
  modules:
    - other-module
---

# demo-search
`;
    const dir = makeModuleAiDir({
      "skills/demo-search/SKILL.md": authored,
    });
    const moduleAi = defineModuleAi({ dir, moduleId: "demo" });
    const markdown = moduleAi.aiRegistration().dynamic?.skills?.["demo-search"];
    expect(markdown).toContain("other-module");
    expect(markdown).not.toMatch(/modules:\n\s+- demo\b/);
  });

  it("stamps the skillMarkdown escape hatch and skills() definitions", () => {
    const moduleAi = defineModuleAi({
      dir: makeModuleAiDir({ "placeholder.txt": "" }),
      moduleId: "demo",
      skillMarkdown: () => ({
        "dyn-skill": "---\nname: dyn-skill\n---\n# dyn",
      }),
      skills: () => [
        { description: "Dynamic.", name: "dyn-skill" },
        {
          description: "Tagged.",
          metadata: { modules: "other" },
          name: "tagged-skill",
        },
      ],
    });
    const registration = moduleAi.aiRegistration();
    expect(registration.dynamic?.skills?.["dyn-skill"]).toMatch(
      /metadata:\n\s+modules:\n\s+- demo/
    );
    const byName = new Map(registration.skills?.map((s) => [s.name, s]));
    expect(byName.get("dyn-skill")?.metadata?.module_id).toBe("demo");
    expect(byName.get("tagged-skill")?.metadata).toEqual({ modules: "other" });
  });

  it("tolerates a tree with no agents/skills/actions/routines", () => {
    const dir = makeModuleAiDir({ "placeholder.txt": "" });
    const registration = defineModuleAi({
      dir,
      moduleId: "demo",
    }).aiRegistration();
    expect(registration.dynamic?.agent_configs).toEqual([]);
    expect(registration.skills).toEqual([]);
    expect(registration.actions).toEqual([]);
    expect(registration.routines).toEqual([]);
  });
});
