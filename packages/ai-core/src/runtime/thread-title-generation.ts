import { generateText, Output } from "ai";
import { z } from "zod";
import { resolveChatModelId } from "../config/chat-model-id.js";
import {
  checkUsageLimits,
  formatUsageLimitError,
} from "../usage/limit-check.js";
import { recordAiUsage } from "../usage/record.js";

const sessionTitleSchema = z.object({
  title: z
    .string()
    .min(2)
    .max(72)
    .describe(
      "Short sidebar label for this chat thread: specific, no quotes, no trailing punctuation."
    ),
});

/** Strip control chars / invalid UTF-16 so DB JSON/text upserts never fail. */
export function sanitizeTitleForStorage(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; ) {
    const code = raw.codePointAt(i);
    if (code === undefined) {
      break;
    }
    const size = code > 0xff_ff ? 2 : 1;
    if (code > 0x1f && code !== 0x7f && code !== 0xff_fd) {
      out += String.fromCodePoint(code);
    }
    i += size;
  }
  return out.trim();
}

export interface GenerateCopilotSessionTitleParams {
  abortSignal?: AbortSignal;
  agentId: string;
  assistantText: string;
  lastUserText: string;
  runId?: string | null;
  tenantId: string | null;
  threadId: string;
  userId: string | null;
}

/**
 * Produces a short conversation title from the latest user + assistant texts.
 * Uses the routing/coordinator model stack (typically smaller/faster than chat).
 */
export async function generateCopilotSessionTitle(
  params: GenerateCopilotSessionTitleParams
): Promise<string | null> {
  const user = params.lastUserText.trim().slice(0, 4000);
  const assistant = params.assistantText.trim().slice(0, 4000);
  if (user.length === 0 && assistant.length === 0) {
    return null;
  }

  const modelId = resolveChatModelId({ purpose: "routing" });
  const preflight = await checkUsageLimits({
    tenant_id: params.tenantId,
    user_id: params.userId,
    model_id: modelId,
    feature: "copilot",
  });
  if (!preflight.allowed) {
    const body = formatUsageLimitError(preflight);
    throw Object.assign(new Error(body.message), {
      status: 429,
      body,
    });
  }

  const result = await generateText({
    abortSignal: params.abortSignal,
    experimental_telemetry: { isEnabled: true },
    model: modelId,
    output: Output.object({ schema: sessionTitleSchema }),
    prompt: `Name this chat thread for a sidebar list.

Rules:
- Be specific to the topic (not "Chat", "Help", "Conversation").
- Prefer the same language as the user message when obvious; otherwise match the assistant language.
- At most 8 words; no quotes; no markdown; no emojis.

User message:
---
${user || "(none)"}
---

Assistant reply (may be truncated):
---
${assistant || "(none)"}
---`,
  });

  const raw = result.output.title.trim().replace(/\s+/g, " ");
  const cleaned = sanitizeTitleForStorage(
    raw.replace(/^["'«»]+|["'«»]+$/g, "").trim()
  );
  if (cleaned.length < 2) {
    return null;
  }

  if (result.usage) {
    await recordAiUsage({
      tenant_id: params.tenantId,
      user_id: params.userId,
      run_id: params.runId ?? null,
      thread_id: params.threadId,
      agent_id: params.agentId,
      feature: "copilot",
      model_id: modelId,
      usage: {
        input: result.usage.inputTokens,
        output: result.usage.outputTokens,
        cached: result.usage.cachedInputTokens,
        reasoning: result.usage.reasoningTokens,
      },
    });
  }

  return cleaned.length > 72 ? `${cleaned.slice(0, 69)}…` : cleaned;
}
