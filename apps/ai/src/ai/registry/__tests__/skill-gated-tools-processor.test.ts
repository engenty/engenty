import { describe, expect, it } from "vitest";
import { createSkillGatedToolsProcessor } from "../skill-gated-tools-processor.js";

const GATING = {
  bySkill: {
    "hire-agent": ["agent_propose", "routines_create"],
    "space-data": ["table_write"],
  },
};

const TOOLS = {
  agent_propose: {},
  navigate: {},
  routines_create: {},
  table_write: {},
} as Record<string, unknown>;

type StepArgs = Parameters<
  NonNullable<
    ReturnType<typeof createSkillGatedToolsProcessor>["processInputStep"]
  >
>[0];

function run(input: { messages?: unknown[]; steps?: unknown[] }) {
  const processor = createSkillGatedToolsProcessor(GATING);
  return processor.processInputStep?.({
    messages: input.messages ?? [],
    steps: input.steps ?? [],
    tools: TOOLS,
  } as unknown as StepArgs) as { activeTools?: string[] } | undefined;
}

function skillStep(name: string) {
  return { toolCalls: [{ input: { name }, toolName: "skill" }] };
}

function skillMessage(name: string) {
  return {
    content: {
      parts: [
        {
          toolInvocation: { args: { name }, toolName: "skill" },
          type: "tool-invocation",
        },
      ],
    },
  };
}

describe("createSkillGatedToolsProcessor", () => {
  it("withholds every gated tool while no skill is active", () => {
    expect(run({})?.activeTools).toEqual(["navigate"]);
  });

  it("unlocks a lane from a skill call in the current run", () => {
    expect(run({ steps: [skillStep("hire-agent")] })?.activeTools).toEqual([
      "agent_propose",
      "navigate",
      "routines_create",
    ]);
  });

  // The skill body stays in the transcript, so a model that already has it will
  // not call the tool again — the lane has to stay open for the whole thread.
  it("unlocks a lane from a skill call in recalled history", () => {
    expect(
      run({ messages: [skillMessage("space-data")] })?.activeTools
    ).toEqual(["navigate", "table_write"]);
  });

  it("accepts a skill addressed by path", () => {
    expect(
      run({ steps: [skillStep("skills/space-data/SKILL.md")] })?.activeTools
    ).toEqual(["navigate", "table_write"]);
  });

  it("adds nothing for a skill that gates no tools", () => {
    expect(run({ steps: [skillStep("work-routing")] })?.activeTools).toEqual([
      "navigate",
    ]);
  });

  // A per-run AG-UI frontend tool carries a name this config cannot know. It
  // must never be filtered out just for being unlisted.
  it("leaves an unlisted tool active", () => {
    const processor = createSkillGatedToolsProcessor(GATING);
    const result = processor.processInputStep?.({
      messages: [],
      steps: [],
      tools: { focusField: {}, table_write: {} },
    } as unknown as StepArgs) as { activeTools?: string[] } | undefined;
    expect(result?.activeTools).toEqual(["focusField"]);
  });

  it("returns undefined when nothing attached is gated", () => {
    const processor = createSkillGatedToolsProcessor(GATING);
    const result = processor.processInputStep?.({
      messages: [],
      steps: [],
      tools: { navigate: {} },
    } as unknown as StepArgs);
    expect(result).toBeUndefined();
  });

  it("ignores tool calls that are not skill activations", () => {
    expect(
      run({
        steps: [
          {
            toolCalls: [
              { input: { name: "hire-agent" }, toolName: "skill_search" },
            ],
          },
        ],
      })?.activeTools
    ).toEqual(["navigate"]);
  });
});
