// Title + description for a saved workflow — generated ONCE at save when
// absent, stored, never re-derived (PLAN-mounted-engentys target model). Human
// lists and agent discovery both read the stored values.
//
// One fast-text model call; a failed or unconfigured gateway falls back to
// deterministic derivation so a save never blocks on the LLM.
import { resolveChatModelId } from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import { generateText } from "ai";

const logger = createLogger({ name: "generate-workflow-title" });

const INSTRUCTIONS = [
  "You name automation workflows. Given a workflow's JSON definition, answer with exactly two lines:",
  "TITLE: <3–6 word human title, no trailing period>",
  "DESCRIPTION: <one plain sentence saying what the workflow does>",
  "No markdown, no code fence, nothing else.",
].join("\n");

const TITLE_LINE = /^[\s*#_-]*title[\s*_]*:[ \t*_]*(.+)$/im;
const DESCRIPTION_LINE = /^[\s*#_-]*description[\s*_]*:[ \t*_]*(.+)$/im;

function lineValue(text: string, pattern: RegExp): string | null {
  const value = pattern
    .exec(text)?.[1]
    ?.trim()
    .replace(/[*_`]+$/, "")
    .trim()
    .replace(/^["'“„]|["'”“]$/g, "")
    .trim();
  return value || null;
}

/** Read the `TITLE:` / `DESCRIPTION:` lines; either may be missing. */
export function parseWorkflowTitleText(text: string): {
  description: string | null;
  title: string | null;
} {
  return {
    description: lineValue(text, DESCRIPTION_LINE),
    title: lineValue(text, TITLE_LINE),
  };
}

function humanize(id: string): string {
  const local = id.includes(".") ? (id.split(".").at(-1) ?? id) : id;
  const words = local.replace(/[-_]+/g, " ").trim();
  return words ? words[0]?.toUpperCase() + words.slice(1) : id;
}

export async function generateWorkflowTitle(input: {
  definition: Record<string, unknown>;
  id: string;
}): Promise<{ description: string | null; title: string }> {
  const fallback = {
    description: null,
    title: humanize(input.id),
  };
  if (!process.env.AI_GATEWAY_API_KEY?.trim()) {
    return fallback;
  }
  try {
    const { text } = await generateText({
      instructions: INSTRUCTIONS,
      maxOutputTokens: 120,
      model: resolveChatModelId({ purpose: "fast_text" }),
      prompt: JSON.stringify(input.definition).slice(0, 6000),
      temperature: 0.2,
    });
    const parsed = parseWorkflowTitleText(text);
    const title = parsed.title?.slice(0, 120) ?? fallback.title;
    const description = parsed.description?.slice(0, 500) ?? null;
    return { description, title };
  } catch (error) {
    logger.warn("workflow title generation failed — using fallback", {
      error: error instanceof Error ? error.message : String(error),
      workflowId: input.id,
    });
    return fallback;
  }
}
