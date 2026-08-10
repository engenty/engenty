import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  listActiveAiRegistrations,
  listModuleDynamicCapabilitySeeds,
  listRegisteredRoutines,
  listRegisteredSkills,
  registerAiRegistration,
  resolveActionDefinitionById,
  resolveAgentDefinitionById,
  resolveRoutineDefinitionById,
  resolveSkillDefinitionById,
  unregisterAiRegistration,
  unregisterAiRegistrationsByOwner,
} from "../registry.js";

describe("ai-core registry", () => {
  afterEach(() => {
    unregisterAiRegistration("contacts");
    unregisterAiRegistration("projects");
    unregisterAiRegistration("tasks");
  });

  it("supports additive orchestrator registrations", () => {
    registerAiRegistration({
      module_id: "contacts",
      instruction_documents: [
        {
          id: "contacts_manager_agents",
          module_id: "contacts",
          key: "contacts_manager_agents",
          title: "Contacts Manager identity",
          default_body: "You are the Contacts Manager for Engenty.",
          layer: "agent",
        },
      ],
      agents: [
        {
          id: "contacts.manager",
          module_id: "contacts",
          name: "Contacts Manager",
          instruction_keys: ["contacts_manager_agents"],
          build_tools: () => ({}),
          skills: ["contacts-search"],
        },
      ],
      actions: [
        {
          id: "contacts.search-action",
          module_id: "contacts",
          name: "Search contacts",
          agent_id: "contacts.manager",
          prompt: "Search and summarize matching contacts.",
          input_schema: z.object({}),
          default_thread_mode: "new",
          skills: ["contacts-search"],
        },
      ],
      routines: [
        {
          enabled_by_default: true,
          id: "contacts.search-routine",
          module_id: "contacts",
          name: "Contacts search routine",
          schedule: "0 * * * *",
          target: {
            kind: "task_template",
            task_template: {
              agent_type_key: "contacts.manager",
              title: "Contacts search routine",
            },
          },
        },
      ],
      skills: [
        {
          description: "Search contacts with structured filters.",
          metadata: {
            module_id: "contacts",
            owner_id: "contacts",
            owner_kind: "module",
          },
          name: "contacts-search",
          title: "Search contacts",
        },
      ],
      triggers: [
        {
          id: "contacts_search_trigger",
          moduleId: "contacts",
          routeKey: "search",
          triggerType: "button",
          feedbackMode: "chat",
        },
      ],
    });

    expect(
      listActiveAiRegistrations().some(
        (registration) => registration.module_id === "contacts"
      )
    ).toBe(true);
    expect(resolveAgentDefinitionById("contacts.manager")?.module_id).toBe(
      "contacts"
    );
    expect(resolveAgentDefinitionById("contacts.manager")?.skills).toEqual([
      "contacts-search",
    ]);
    expect(
      resolveActionDefinitionById("contacts.search-action")?.agent_id
    ).toBe("contacts.manager");
    expect(
      resolveActionDefinitionById("contacts.search-action")?.skills
    ).toEqual(["contacts-search"]);
    expect(
      resolveRoutineDefinitionById("contacts.search-routine")?.target.kind
    ).toBe("task_template");
    expect(
      listRegisteredRoutines().some(
        (routine) => routine.id === "contacts.search-routine"
      )
    ).toBe(true);
    expect(
      resolveSkillDefinitionById("contacts-search")?.metadata?.owner_kind
    ).toBe("module");
    expect(
      listRegisteredSkills().some((skill) => skill.name === "contacts-search")
    ).toBe(true);
    expect(
      listActiveAiRegistrations().find(
        (registration) => registration.module_id === "contacts"
      )?.triggers?.[0]?.id
    ).toBe("contacts_search_trigger");

    unregisterAiRegistration("contacts");

    expect(
      listActiveAiRegistrations().some(
        (registration) => registration.module_id === "contacts"
      )
    ).toBe(false);
  });

  it("carries serializable actions and routines on the capability seed", () => {
    registerAiRegistration({
      module_id: "tasks",
      actions: [
        {
          agent_id: "tasks.manager",
          default_thread_mode: "new",
          id: "tasks.cleanup",
          input_schema: z.object({ scope: z.string() }),
          module_id: "tasks",
          name: "Cleanup tasks",
          prompt: "Clean up stale tasks.",
        },
      ],
      routines: [
        {
          enabled_by_default: true,
          id: "tasks.nightly",
          module_id: "tasks",
          name: "Nightly tasks sweep",
          schedule: "0 3 * * *",
          target: {
            kind: "task_template",
            task_template: {
              agent_type_key: "tasks.manager",
              title: "Nightly tasks sweep",
            },
          },
        },
      ],
    });

    const seed = listModuleDynamicCapabilitySeeds().find(
      (capability) => capability.moduleId === "tasks"
    );
    expect(seed).toBeDefined();
    expect(seed?.routines?.map((routine) => routine.id)).toEqual([
      "tasks.nightly",
    ]);
    const action = seed?.actions?.[0];
    expect(action?.id).toBe("tasks.cleanup");
    // zod input_schema is projected to JSON Schema for transport.
    expect(action).not.toHaveProperty("input_schema");
    expect(action?.input_schema_json).toMatchObject({
      properties: { scope: { type: "string" } },
      type: "object",
    });
    // The whole seed must survive JSON serialization (cross-process channel).
    expect(() => JSON.stringify(seed)).not.toThrow();
  });

  it("unregisters only matching plugin generation registrations", () => {
    registerAiRegistration(
      {
        agents: [],
        module_id: "contacts",
        triggers: [],
      },
      { generationId: 1, pluginId: "contacts" }
    );
    registerAiRegistration(
      {
        agents: [],
        module_id: "projects",
        triggers: [],
      },
      { generationId: 2, pluginId: "projects" }
    );
    registerAiRegistration(
      {
        agents: [],
        module_id: "tasks",
        triggers: [],
      },
      { generationId: 2, pluginId: "contacts" }
    );

    expect(
      unregisterAiRegistrationsByOwner({
        generationId: 1,
        pluginId: "contacts",
      })
    ).toEqual({ removed: 1 });

    expect(
      listActiveAiRegistrations().map((registration) => registration.module_id)
    ).toEqual(["projects", "tasks"]);
  });
});
