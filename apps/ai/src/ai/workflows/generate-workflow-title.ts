// Title + description for a saved workflow — generated ONCE at save when
// absent, stored, never re-derived (PLAN-mounted-engentys target model). Human
// lists and agent discovery both read the stored values.
//
// One small model call; a failed or unconfigured gateway falls back to
// deterministic derivation so a save never blocks on the LLM.
import { DEFAULT_AI_CLASSIFIER_MODEL_ID } from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import { generateText } from "ai";

const logger = createLogger({ name: "generate-workflow-title" });

const INSTRUCTIONS =
  "You name automation workflows. Given a workflow's JSON definition, answer " +
  'with EXACTLY one JSON object {"title": string, "description": string}: a ' +
  "3–6 word human title (no trailing period) and one plain sentence saying " +
  "what the workflow does. No markdown, no code fence.";

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
      model: DEFAULT_AI_CLASSIFIER_MODEL_ID,
      prompt: JSON.stringify(input.definition).slice(0, 6000),
      temperature: 0.2,
    });
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end <= start) {
      return fallback;
    }
    const parsed = JSON.parse(text.slice(start, end + 1)) as {
      description?: unknown;
      title?: unknown;
    };
    const title =
      typeof parsed.title === "string" && parsed.title.trim()
        ? parsed.title.trim().slice(0, 120)
        : fallback.title;
    const description =
      typeof parsed.description === "string" && parsed.description.trim()
        ? parsed.description.trim().slice(0, 500)
        : null;
    return { description, title };
  } catch (error) {
    logger.warn("workflow title generation failed — using fallback", {
      error: error instanceof Error ? error.message : String(error),
      workflowId: input.id,
    });
    return fallback;
  }
}
