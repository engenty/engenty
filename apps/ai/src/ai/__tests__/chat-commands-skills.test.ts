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
});
