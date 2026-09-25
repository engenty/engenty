// The copilot's first words in a person's river.
//
// Written once, when the river is opened for the first time, so the chat does
// not start empty — and so the model finds its own offer in the history when
// the person answers "ja" (AGENTS.md routes that to the getting-started skill).
//
// One text, in English; any other language is a translation by the fast text
// model, so no locale needs its own copy. No model, or no answer in time:
// the English stands.
import {
  readAiGatewayApiKeyFromEnv,
  resolvePurposeModelId,
} from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import { generateText } from "ai";
import type { ThreadStore } from "../../dal/threads/thread-store.js";
import { stableUuid } from "../workflows/dispatch-published-run.js";

export const RIVER_WELCOME_SOURCE = "river-welcome";

export const RIVER_WELCOME_TIMEOUT_MS = 4000;

const logger = createLogger({ name: "apps/ai/river-welcome" });

export const COPILOT_WELCOME_TEXT = [
  "Hi! I'm your Copilot — with you everywhere in Engenty, whichever Space you're in.",
  "To start, let's set your Space up together: a **Chief of Staff** who coordinates it, and the one or two apps you actually need — nothing more.",
  "Shall we begin?",
].join("\n\n");

export type TranslateWelcome = (input: {
  language: string;
  text: string;
}) => Promise<string>;

async function callTranslateModel(input: {
  language: string;
  text: string;
}): Promise<string> {
  const { text } = await generateText({
    instructions: `Translate the user's message into the language with the BCP 47 tag "${input.language}". Keep the Markdown, the line breaks, the product names "Engenty", "Copilot" and "Space", and the informal, friendly tone (e.g. German "du"). Reply with the translation only.`,
    maxOutputTokens: 400,
    model: resolvePurposeModelId({ purpose: "fast_text" }),
    prompt: input.text,
    temperature: 0,
  });
  return text.trim();
}

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error("river_welcome_timeout")), ms);
  });
}

/** The welcome in `language`; English when that is English or unknown. */
export async function copilotWelcomeText(input: {
  language: string | null | undefined;
  translate?: TranslateWelcome;
}): Promise<string> {
  const language = input.language?.trim();
  if (
    !language ||
    language.toLowerCase().startsWith("en") ||
    !(input.translate || readAiGatewayApiKeyFromEnv())
  ) {
    return COPILOT_WELCOME_TEXT;
  }
  try {
    const translated = await Promise.race([
      (input.translate ?? callTranslateModel)({
        language,
        text: COPILOT_WELCOME_TEXT,
      }),
      timeout(RIVER_WELCOME_TIMEOUT_MS),
    ]);
    return translated.trim() || COPILOT_WELCOME_TEXT;
  } catch (error) {
    logger.warn("river welcome translation failed; keeping English", {
      error: error instanceof Error ? error.message : String(error),
      language,
    });
    return COPILOT_WELCOME_TEXT;
  }
}

/** Leaves the welcome in a river that was just opened. Idempotent by id. */
export async function writeRiverWelcome(input: {
  createdAt: string;
  language: string | null | undefined;
  store: Pick<ThreadStore, "appendMessage">;
  tenantId: string;
  threadId: string;
  translate?: TranslateWelcome;
}): Promise<void> {
  const text = await copilotWelcomeText({
    language: input.language,
    ...(input.translate ? { translate: input.translate } : {}),
  });
  await input.store.appendMessage({
    authorUserId: null,
    createdAt: input.createdAt,
    id: stableUuid(`${RIVER_WELCOME_SOURCE}:${input.threadId}`),
    metadata: { source: RIVER_WELCOME_SOURCE },
    parts: [{ text, type: "text" }],
    role: "assistant",
    tenantId: input.tenantId,
    threadId: input.threadId,
  });
}
