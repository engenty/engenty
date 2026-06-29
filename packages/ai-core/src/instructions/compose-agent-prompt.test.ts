import { describe, expect, it } from "vitest";

import { buildAgentLayeredPrompt } from "./compose-agent-prompt.js";

describe("buildAgentLayeredPrompt", () => {
  it("cascades agents layers (tenant base -> per-agent) before the single prompt", () => {
    const prompt = buildAgentLayeredPrompt({
      agentsLayers: ["TENANT RULES", "AGENT RULES"],
      agentsPrompt: "CONVENIENCE",
      includeSoul: false,
      specialistPrompt: "SPECIALIST",
    });

    expect(prompt).toBe(
      ["TENANT RULES", "AGENT RULES", "CONVENIENCE", "SPECIALIST"].join("\n\n")
    );
  });

  it("orders runtime rules, agents, soul, specialist, coordinator", () => {
    const prompt = buildAgentLayeredPrompt({
      agentsLayers: ["A"],
      coordinatorNote: "COORD",
      runtimeRules: "RUNTIME",
      soulLayers: ["S"],
      specialistPrompt: "SPEC",
    });

    expect(prompt).toBe(["RUNTIME", "A", "S", "SPEC", "COORD"].join("\n\n"));
  });

  it("drops blank and whitespace-only layers", () => {
    const prompt = buildAgentLayeredPrompt({
      agentsLayers: ["  ", "", "REAL"],
      includeSoul: false,
      specialistPrompt: "SPEC",
    });

    expect(prompt).toBe(["REAL", "SPEC"].join("\n\n"));
  });

  it("omits layers when include flags are false", () => {
    const prompt = buildAgentLayeredPrompt({
      agentsLayers: ["A"],
      includeAgents: false,
      includeSoul: false,
      soulLayers: ["S"],
      specialistPrompt: "SPEC",
    });

    expect(prompt).toBe("SPEC");
  });
});
