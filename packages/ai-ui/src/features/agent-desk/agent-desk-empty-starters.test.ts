import { describe, expect, it } from "vitest";
import {
  agentDeskEmptyStarters,
  mergeAgentDeskStarters,
} from "./agent-desk-empty-starters.js";

const tc = (key: string) => key;

describe("agentDeskEmptyStarters", () => {
  it("uses declared starters and always appends what-can-you-do", () => {
    expect(
      agentDeskEmptyStarters(tc, {
        starters: [{ id: "job", label: "Job", prompt: "Do the job." }],
      }).map((item) => item.id)
    ).toEqual(["job", "what-can-you-do"]);
  });

  it("falls back to generic chips when the agent declared none", () => {
    expect(
      agentDeskEmptyStarters(tc, { starters: [] }).map((item) => item.id)
    ).toEqual([
      "find-contacts",
      "draft-follow-up",
      "plan-work",
      "what-can-you-do",
    ]);
  });
});

describe("mergeAgentDeskStarters", () => {
  it("keeps declared chips over generated ones with the same id", () => {
    const catalogue = agentDeskEmptyStarters(tc, {
      starters: [{ id: "job", label: "Declared", prompt: "Declared prompt." }],
    });
    expect(
      mergeAgentDeskStarters(catalogue, [
        { id: "job", label: "Generated", prompt: "Generated prompt." },
        { id: "extra", label: "Extra", prompt: "Extra prompt." },
      ])
    ).toEqual([
      { id: "job", label: "Declared", prompt: "Declared prompt." },
      { id: "extra", label: "Extra", prompt: "Extra prompt." },
      {
        id: "what-can-you-do",
        label: "copilot.empty.starters.whatCanYouDo.label",
        prompt: "copilot.empty.starters.whatCanYouDo.prompt",
      },
    ]);
  });
});
