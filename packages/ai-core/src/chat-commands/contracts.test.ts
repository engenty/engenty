import { describe, expect, it } from "vitest";
import {
  type ChatCommandDefinition,
  expandChatCommand,
  isValidChatCommandToken,
  parseLeadingChatCommand,
} from "./contracts.js";

const COMMANDS: ChatCommandDefinition[] = [
  {
    command: "summarize",
    id: "core.summarize",
    kind: "prompt",
    module_id: "core",
    template: "Summarize the conversation. Focus: {input}",
  },
  {
    workflow_id: "offers-create-and-edit",
    command: "offers:create",
    id: "offers.offers:create",
    kind: "workflow",
    module_id: "offers",
  },
];

describe("isValidChatCommandToken", () => {
  it("accepts lowercase ascii tokens with dashes, optionally module-prefixed", () => {
    expect(isValidChatCommandToken("kb")).toBe(true);
    expect(isValidChatCommandToken("create-offer")).toBe(true);
    expect(isValidChatCommandToken("log2")).toBe(true);
    expect(isValidChatCommandToken("offers:create")).toBe(true);
    expect(isValidChatCommandToken("commercial:seed-chart")).toBe(true);
  });

  it("rejects uppercase, leading dash, spaces, unicode", () => {
    expect(isValidChatCommandToken("KB")).toBe(false);
    expect(isValidChatCommandToken("-kb")).toBe(false);
    expect(isValidChatCommandToken("k b")).toBe(false);
    expect(isValidChatCommandToken("übersicht")).toBe(false);
    expect(isValidChatCommandToken("")).toBe(false);
  });

  it("allows one prefix, and neither part empty", () => {
    expect(isValidChatCommandToken("a:b:c")).toBe(false);
    expect(isValidChatCommandToken(":kb")).toBe(false);
    expect(isValidChatCommandToken("kb:")).toBe(false);
    expect(isValidChatCommandToken("kb:-ask")).toBe(false);
  });
});

describe("parseLeadingChatCommand", () => {
  it("matches a leading token and splits the free text", () => {
    const match = parseLeadingChatCommand(
      "/summarize the offers part",
      COMMANDS
    );
    expect(match?.command.id).toBe("core.summarize");
    expect(match?.argsText).toBe("the offers part");
  });

  it("returns null on unknown or non-leading tokens", () => {
    expect(parseLeadingChatCommand("/nope", COMMANDS)).toBeNull();
    expect(parseLeadingChatCommand("say /summarize", COMMANDS)).toBeNull();
  });
});

describe("expandChatCommand", () => {
  it("interpolates {input} in prompt templates", () => {
    const match = parseLeadingChatCommand("/summarize offers only", COMMANDS);
    expect(match).not.toBeNull();
    expect(expandChatCommand(match!)).toBe(
      "Summarize the conversation. Focus: offers only"
    );
  });

  it("builds a directive for action commands naming the action id", () => {
    const match = parseLeadingChatCommand("/offers:create for acme", COMMANDS);
    expect(match).not.toBeNull();
    const expanded = expandChatCommand(match!);
    expect(expanded).toContain('"/offers:create"');
    expect(expanded).toContain("offers-create-and-edit");
    expect(expanded).toContain("for acme");
  });
});
