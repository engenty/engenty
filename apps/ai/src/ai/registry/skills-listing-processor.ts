/**
 * Keeps the skills catalog out of the system prompt.
 *
 * Mastra adds its own `SkillsProcessor` to any agent with workspace skills and
 * that processor writes an `<available_skills>` block (every skill's name,
 * description, location and source) into the system message of every step —
 * 6–10k characters on the copilot. The agent already discovers skills with
 * `skill_search` and loads them with `skill`, so the listing is paid for on
 * every call and used by none.
 *
 * Mastra skips its own processor when one with the id `skills-processor` is
 * configured, and keeps the `skill` / `skill_search` tools. This one takes that
 * slot and only keeps the one side effect worth keeping: the staleness refresh
 * that makes a newly mounted skill discoverable.
 */

import type { Processor } from "@mastra/core/processors";
import type { Workspace } from "@mastra/core/workspace";

interface RefreshableSkills {
  getScoped?: (args: { requestContext?: unknown }) => Promise<unknown>;
  maybeRefresh?: (args: { requestContext?: unknown }) => Promise<unknown>;
}

export function createSkillsListingProcessor(
  workspace: Workspace
): Processor<"skills-processor"> {
  return {
    id: "skills-processor",
    name: "Skills refresh (no listing)",
    async processInputStep({ requestContext, stepNumber }) {
      if (stepNumber !== 0) {
        return;
      }
      const base = workspace.skills as RefreshableSkills | undefined;
      const skills = (
        base?.getScoped ? await base.getScoped({ requestContext }) : base
      ) as RefreshableSkills | undefined;
      skills?.maybeRefresh?.({ requestContext })?.catch(() => undefined);
    },
  };
}
