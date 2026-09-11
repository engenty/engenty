import { describe, expect, it, vi } from "vitest";
import {
  buildChatTurnContextEntries,
  expandChatSkillSelection,
  parseLeadingSlashToken,
} from "../chat-commands.js";
import type { SkillStorage } from "../skills/skill-storage.js";

describe("parseLeadingSlashToken", () => {
  it("splits a leading /token and free text", () => {
    expect(parseLeadingSlashToken("/contacts-search find acme")).toEqual({
      argsText: "find acme",
      token: "contacts-search",
    });
    expect(parseLeadingSlashToken("/KB")).toEqual({
      argsText: "",
      token: "kb",
    });
  });

  it("returns null when not message-leading", () => {
    expect(parseLeadingSlashToken("hello /kb")).toBeNull();
    expect(parseLeadingSlashToken("/")).toBeNull();
  });
});

describe("expandChatSkillSelection", () => {
  it("injects the skill body when available", () => {
    const expanded = expandChatSkillSelection({
      argsText: "find Acme",
      body: "Use contacts_search first.",
      description: "Search contacts",
      name: "contacts-search",
    });
    expect(expanded).toContain('"/contacts-search"');
    expect(expanded).toContain("find Acme");
    expect(expanded).toContain("# Skill: contacts-search");
    expect(expanded).toContain("Use contacts_search first.");
    expect(expanded).toContain("do not call the skill tool to reload it");
  });

  it("falls back to a load directive without a body", () => {
    const expanded = expandChatSkillSelection({
      argsText: "",
      name: "inbox-triage",
    });
    expect(expanded).toContain('"/inbox-triage"');
    expect(expanded).toContain('Load skill "inbox-triage"');
  });
});

describe("buildChatTurnContextEntries skill selection", () => {
  it("expands an unmatched slash token as a skill when storage resolves it", async () => {
    const skillStorage = {
      getSkill: vi.fn(async (name: string) =>
        name === "contacts-search"
          ? {
              body: "Search then present.",
              description: "Find contacts",
              name: "contacts-search",
            }
          : undefined
      ),
    } as unknown as SkillStorage;

    const entries = await buildChatTurnContextEntries({
      agentId: "engenty.copilot",
      prompt: "/contacts-search find Acme",
      refs: [],
      skillStorage,
    });

    expect(skillStorage.getSkill).toHaveBeenCalledWith("contacts-search");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.description).toBe("chat_skill");
    expect(entries[0]?.value).toContain("# Skill: contacts-search");
    expect(entries[0]?.value).toContain("find Acme");
  });

  it("does not skill-expand when a chat command claims the token", async () => {
    const skillStorage = {
      getSkill: vi.fn(),
    } as unknown as SkillStorage;

    const entries = await buildChatTurnContextEntries({
      agentId: "engenty.copilot",
      prompt: "/summarize the thread",
      refs: [],
      skillStorage,
    });

    expect(skillStorage.getSkill).not.toHaveBeenCalled();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.description).toBe("chat_command");
  });

  it("dispatches action slash commands instead of prompting the model to execute them", async () => {
    const invokeWorkflowCommand = vi.fn(async () => ({
      deduped: false,
      runId: "run-1",
    }));
    const entries = await buildChatTurnContextEntries({
      agentId: "engenty.copilot",
      invokeWorkflowCommand,
      moduleLoader: {
        listModuleCapabilities: async () => [
          {
            chatCommands: [
              {
                workflow_id: "contacts-research",
                command: "research-contact",
                id: "contacts.research-contact",
                kind: "workflow",
                module_id: "contacts",
              },
            ],
          },
        ],
      } as never,
      prompt: "/research-contact",
      refs: [
        {
          entity: "contacts:contact",
          label: "Acme",
          ref: "contacts:contact:contact-1",
        },
      ],
    });

    expect(invokeWorkflowCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        argsText: "",
        command: expect.objectContaining({ workflow_id: "contacts-research" }),
      })
    );
    expect(entries[0]).toMatchObject({ description: "chat_command_workflow" });
    expect(entries[0]?.value).toContain("run run-1");
    expect(entries[0]?.value).toContain("Do not call the Action");
  });
});

describe("buildChatTurnContextEntries mentioned agents", () => {
  it("tells the agent who was mentioned and how to reach them, apart from object refs", async () => {
    const entries = await buildChatTurnContextEntries({
      agentId: "chief-of-staff",
      prompt: "@inbox-overview what is open? Also see @Acme",
      refs: [
        {
          entity: "ai:agent",
          label: "Inbox Overview Assistant",
          ref: "ai:agent:inbox.overview",
        },
        {
          entity: "contacts:contact",
          label: "Acme",
          ref: "contacts:contact:contact-1",
        },
      ],
    });

    expect(entries.map((entry) => entry.description)).toEqual([
      "user_mentioned_agents",
      "user_references",
    ]);
    expect(entries[0]?.value).toContain("`inbox.overview`");
    expect(entries[0]?.value).toContain("message_agent");
    expect(entries[0]?.value).not.toContain("contacts:contact");
    expect(entries[1]?.value).toContain("contacts:contact:contact-1");
    expect(entries[1]?.value).not.toContain("inbox.overview");
  });
});
