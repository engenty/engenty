import { describe, expect, it } from "vitest";
import { AGENT_ENGENTY_KINDS } from "./agent-engenty.js";
import {
  AGENT_ENGENTY_LOOKS,
  agentEngentyLook,
  suggestAgentLook,
} from "./agent-look.js";
import { buildAgentLookImagePrompt } from "./agent-look-prompt.js";

describe("AGENT_ENGENTY_LOOKS", () => {
  it("covers every kind with a color", () => {
    expect(AGENT_ENGENTY_LOOKS.map((look) => look.kind).sort()).toEqual(
      [...AGENT_ENGENTY_KINDS].sort()
    );
    for (const look of AGENT_ENGENTY_LOOKS) {
      expect(agentEngentyLook(look.kind)?.color).toBe(look.color);
    }
  });
});

describe("suggestAgentLook", () => {
  it("picks oval for visual identity work", () => {
    const suggested = suggestAgentLook({
      description: "Designs portraits and visual identity for hired Engenties.",
      name: "Looksmith",
    });
    expect(suggested.look.kind).toBe("oval");
    expect(suggested.name).toBe("Looksmith");
  });

  it("picks sprout for identity coaching", () => {
    expect(
      suggestAgentLook({
        description: "Coaches identity and onboarding.",
      }).look.kind
    ).toBe("sprout");
  });

  it("picks flame for a marketing writer", () => {
    expect(
      suggestAgentLook({
        description: "Drafts marketing copy in the company voice.",
      }).look.kind
    ).toBe("flame");
  });

  it("falls back to a hashed kind when there is no cue", () => {
    const suggested = suggestAgentLook({ id: "zzz.unknown" });
    expect(AGENT_ENGENTY_KINDS).toContain(suggested.look.kind);
    expect(suggested.name).toBe("Engenty");
  });
});

describe("buildAgentLookImagePrompt", () => {
  it("names the blob style and forbids photoreal humans", () => {
    const prompt = buildAgentLookImagePrompt({
      brief: "a little more mischievous",
      kind: "sprout",
      name: "Looksmith",
    });
    expect(prompt).toContain("sprout");
    expect(prompt).toContain("citron");
    expect(prompt).toContain("NOT a human");
    expect(prompt).toContain("mischievous");
    expect(prompt).toContain("Looksmith");
    expect(prompt).toContain("do not render any text");
  });
});
