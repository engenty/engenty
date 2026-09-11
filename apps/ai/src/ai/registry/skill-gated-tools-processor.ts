/**
 * Skill-gated tool visibility.
 *
 * Every tool an agent carries used to ride in every model call. On the copilot
 * that was 73 tools and ~22k tokens, of which the durable-work, space-data,
 * workspace and browser lanes — together more than half — fired in none of the
 * 143 stored turns we measured. They are lane work: AGENTS.md already tells the
 * model to load the lane's skill before doing any of it.
 *
 * So the skill carries its tools. A tool named in `bySkill` is withheld until
 * that skill is activated; everything else is always offered. Mastra runs
 * `processInputStep` on every step of the agentic loop and honours the
 * `activeTools` it returns, and `prepareToolsAndToolChoice` filters by that list
 * BEFORE serialising the tool block — so a tool appears the moment its skill is
 * activated, in the same turn, with no second user message.
 *
 * This gates VISIBILITY only. Every tool stays attached, space-gated and
 * approval-gated exactly as before; withholding a schema is not authorization.
 *
 * Fail-open is deliberate in two directions:
 *  - a tool named in no list is always active, because AG-UI registers frontend
 *    tools per run under names this config cannot know, and a tool nobody gated
 *    must never silently vanish;
 *  - an activated skill with no entry adds nothing, because most skills are
 *    instructions only.
 */

import type { AgentToolGatingConfig } from "@engenty/ai-core";
import type { Processor } from "@mastra/core/processors";

/** Mastra's workspace skill-activation tool (`@mastra/core` workspace tools). */
const SKILL_ACTIVATION_TOOL_ID = "skill";

export const SKILL_GATED_TOOLS_PROCESSOR_ID = "skill-gated-tools";

/**
 * A gated agent has to be told the gate exists. Without this it reads an absent
 * tool as an absent capability and tells the user the product cannot do the
 * thing — the one failure mode this whole mechanism could introduce.
 */
export const SKILL_GATED_TOOLS_INSTRUCTIONS = `## Tools that arrive with a skill

Some tools are not listed until the skill that owns them is active. Loading that skill with the \`skill\` tool adds them immediately — in this same turn, before your next step. A tool you expected and cannot see is therefore not missing: it belongs to a lane you have not opened yet. Load that lane's skill, then call the tool. Never tell the user a capability does not exist because its tool is absent from your list.`;

/**
 * A skill is addressed by name OR by path ("Use the path when multiple skills
 * share the same name"), so both forms have to land on the same key.
 */
function skillKey(value: string): string {
  const segments = value.trim().toLowerCase().split("/").filter(Boolean);
  // A skill path names the FOLDER — `skills/space-data/SKILL.md` is the
  // space-data skill, not a skill called "skill".
  while (segments.length > 1 && segments.at(-1)?.endsWith(".md")) {
    segments.pop();
  }
  return (segments.at(-1) ?? "").replace(/\.md$/, "");
}

function readSkillName(args: unknown): string | undefined {
  if (!args || typeof args !== "object") {
    return;
  }
  const name = (args as { name?: unknown }).name;
  return typeof name === "string" && name.trim().length > 0 ? name : undefined;
}

/**
 * Skills activated anywhere in this thread, not just this run: the `skill`
 * result stays in the transcript, so a model that already has the body will not
 * call the tool again — re-collapsing the lane on the next user message would
 * take the tools away while the instructions telling it to use them remain.
 */
function activatedSkills(input: {
  messages?: readonly unknown[];
  steps?: readonly unknown[];
}): Set<string> {
  const found = new Set<string>();
  const add = (toolName: unknown, args: unknown) => {
    if (toolName !== SKILL_ACTIVATION_TOOL_ID) {
      return;
    }
    const name = readSkillName(args);
    if (name) {
      found.add(skillKey(name));
    }
  };

  for (const step of input.steps ?? []) {
    const calls = (step as { toolCalls?: unknown }).toolCalls;
    for (const call of Array.isArray(calls) ? calls : []) {
      const record = call as {
        args?: unknown;
        input?: unknown;
        toolName?: unknown;
      };
      add(record.toolName, record.input ?? record.args);
    }
  }

  for (const message of input.messages ?? []) {
    const content = (message as { content?: unknown }).content;
    const parts = (content as { parts?: unknown } | undefined)?.parts;
    for (const part of Array.isArray(parts) ? parts : []) {
      const record = part as {
        args?: unknown;
        input?: unknown;
        toolInvocation?: {
          args?: unknown;
          input?: unknown;
          toolName?: unknown;
        };
        toolName?: unknown;
      };
      const invocation = record.toolInvocation;
      if (invocation) {
        add(invocation.toolName, invocation.input ?? invocation.args);
        continue;
      }
      add(record.toolName, record.input ?? record.args);
    }
  }

  return found;
}

export function createSkillGatedToolsProcessor(
  gating: AgentToolGatingConfig
): Processor {
  const bySkill = new Map(
    Object.entries(gating.bySkill).map(([skill, toolIds]) => [
      skillKey(skill),
      toolIds,
    ])
  );
  const gatedToolIds = new Set([...bySkill.values()].flat());

  return {
    id: SKILL_GATED_TOOLS_PROCESSOR_ID,
    processInputStep({ messages, steps, tools }) {
      const attached = Object.keys(tools ?? {});
      if (attached.length === 0) {
        return;
      }
      // Recomputed from the transcript on every step rather than accumulated in
      // processor state: `messages`/`steps` are the whole history, so the same
      // step always yields the same list — across a resume, a retry, or a
      // parked approval that continues the run hours later.
      const open = activatedSkills({ messages, steps });
      const unlocked = new Set(
        [...open].flatMap((skill) => bySkill.get(skill) ?? [])
      );
      const activeTools = attached.filter(
        (id) => !gatedToolIds.has(id) || unlocked.has(id)
      );
      return activeTools.length === attached.length
        ? undefined
        : { activeTools };
    },
  };
}
