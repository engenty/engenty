import { afterEach, describe, expect, it } from "vitest";
import {
  listActiveAiRegistrations,
  listModuleDynamicCapabilitySeeds,
  listRegisteredRoutines,
  listRegisteredSkills,
  registerAiRegistration,
  resolveRoutineDefinitionById,
  resolveSkillDefinitionById,
  resolveWorkflowDefinitionById,
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
      workflows: [
        {
          definition: {
            graph: [
              {
                id: "prepare",
                mapConfig: "{}",
                type: "mapping",
              },
              { id: "run", toolId: "run_specialist", type: "tool" },
            ],
            id: "contacts.search-action",
            inputSchema: { type: "object" },
            metadata: { owner_agent_id: "contacts.manager" },
            outputSchema: {},
          },
          id: "contacts.search-action",
          module_id: "contacts",
          name: "Search contacts",
          owner_agent_id: "contacts.manager",
          skills: ["contacts-search"],
        },
      ],
      routines: [
        {
          agent_id: "contacts.manager",
          cron: "0 * * * *",
          enabled_by_default: true,
          id: "contacts.search-routine",
          kind: "schedule" as const,
          module_id: "contacts",
          name: "Contacts search routine",
          scope: "space" as const,
          workflow: "contacts.search-action",
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
    expect(
      resolveWorkflowDefinitionById("contacts.search-action")?.owner_agent_id
    ).toBe("contacts.manager");
    expect(
      resolveWorkflowDefinitionById("contacts.search-action")?.skills
    ).toEqual(["contacts-search"]);
    expect(
      resolveRoutineDefinitionById("contacts.search-routine")?.workflow
    ).toBe("contacts.search-action");
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

  it("carries workflows and triggers on the capability seed", () => {
    registerAiRegistration({
      module_id: "tasks",
      workflows: [
        {
          definition: {
            graph: [{ id: "run", toolId: "run_specialist", type: "tool" }],
            id: "tasks.cleanup",
            inputSchema: {
              properties: { scope: { type: "string" } },
              type: "object",
            },
            outputSchema: {},
          },
          id: "tasks.cleanup",
          module_id: "tasks",
          name: "Cleanup tasks",
        },
      ],
      routines: [
        {
          agent_id: "tasks.manager",
          cron: "0 3 * * *",
          enabled_by_default: true,
          id: "tasks.nightly",
          kind: "schedule" as const,
          module_id: "tasks",
          name: "Nightly tasks sweep",
          scope: "space" as const,
          workflow: "tasks.cleanup",
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
    const action = seed?.workflows?.[0];
    expect(action?.id).toBe("tasks.cleanup");
    expect(action?.definition.inputSchema).toMatchObject({
      properties: { scope: { type: "string" } },
      type: "object",
    });
    // The whole seed must survive JSON serialization (cross-process channel).
    expect(() => JSON.stringify(seed)).not.toThrow();
  });

  it("unregisters only matching plugin generation registrations", () => {
    registerAiRegistration(
      {
        module_id: "contacts",
        triggers: [],
      },
      { generationId: 1, pluginId: "contacts" }
    );
    registerAiRegistration(
      {
        module_id: "projects",
        triggers: [],
      },
      { generationId: 2, pluginId: "projects" }
    );
    registerAiRegistration(
      {
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
