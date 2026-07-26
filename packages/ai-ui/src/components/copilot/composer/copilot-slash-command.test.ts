import { describe, expect, it } from "vitest";
import {
  type ChatSlashCommand,
  filterSlashCommands,
  getSlashQueryAtCursor,
  groupSlashCommands,
  parseLeadingSlashCommand,
} from "./copilot-slash-command";

const COMMANDS: ChatSlashCommand[] = [
  { command: "help", group: "Core", kind: "ui" },
  { command: "clear", group: "Core", kind: "ui" },
  {
    command: "create-offer",
    group: "offers",
    kind: "action",
    label: "Create offer",
  },
  { command: "kb", group: "knowledge-base", kind: "prompt" },
];

describe("getSlashQueryAtCursor", () => {
  it("triggers only on a message-leading slash", () => {
    expect(getSlashQueryAtCursor("/cre", 4)).toEqual({ query: "cre" });
    expect(getSlashQueryAtCursor("/", 1)).toEqual({ query: "" });
    expect(getSlashQueryAtCursor("hello /cre", 10)).toBeNull();
    expect(getSlashQueryAtCursor(" /cre", 5)).toBeNull();
  });

  it("closes once the token is finished (whitespace before caret)", () => {
    expect(getSlashQueryAtCursor("/kb what is x", 13)).toBeNull();
    expect(getSlashQueryAtCursor("/kb ", 4)).toBeNull();
  });

  it("ignores a caret before the slash", () => {
    expect(getSlashQueryAtCursor("/kb", 0)).toBeNull();
  });
});

describe("parseLeadingSlashCommand", () => {
  it("matches the exact token case-insensitively and splits args", () => {
    const match = parseLeadingSlashCommand("/KB  what is x ", COMMANDS);
    expect(match?.command.command).toBe("kb");
    expect(match?.argsText).toBe("what is x");
  });

  it("returns null for unknown tokens and plain text", () => {
    expect(parseLeadingSlashCommand("/unknown foo", COMMANDS)).toBeNull();
    expect(parseLeadingSlashCommand("hello", COMMANDS)).toBeNull();
    expect(parseLeadingSlashCommand("/", COMMANDS)).toBeNull();
  });

  it("does not prefix-match", () => {
    expect(parseLeadingSlashCommand("/create", COMMANDS)).toBeNull();
    expect(
      parseLeadingSlashCommand("/create-offer for acme", COMMANDS)?.command
        .command
    ).toBe("create-offer");
  });
});

describe("filterSlashCommands", () => {
  it("matches command tokens and labels (label filter-only)", () => {
    expect(filterSlashCommands(COMMANDS, "cre").map((c) => c.command)).toEqual([
      "create-offer",
    ]);
    expect(
      filterSlashCommands(COMMANDS, "offer").map((c) => c.command)
    ).toEqual(["create-offer"]);
    expect(filterSlashCommands(COMMANDS, "").length).toBe(COMMANDS.length);
  });

  it("matches skill descriptions for typeahead", () => {
    const withSkill: ChatSlashCommand[] = [
      ...COMMANDS,
      {
        command: "contacts-search",
        description: "Find people and companies",
        group: "Skills",
        kind: "skill",
        label: "Contacts search",
      },
    ];
    expect(
      filterSlashCommands(withSkill, "people").map((c) => c.command)
    ).toEqual(["contacts-search"]);
    expect(
      filterSlashCommands(withSkill, "contacts-search").map((c) => c.command)
    ).toEqual(["contacts-search"]);
  });
});

describe("groupSlashCommands", () => {
  it("preserves order within groups", () => {
    const groups = groupSlashCommands(COMMANDS);
    expect(groups.map((g) => g.group)).toEqual([
      "Core",
      "offers",
      "knowledge-base",
    ]);
    expect(groups[0]?.commands.map((c) => c.command)).toEqual([
      "help",
      "clear",
    ]);
  });
});
