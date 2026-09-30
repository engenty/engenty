// The composer's choice, as people see it: Normal, Extra, or a Custom model
// from the platform's list. Everything here is pure so the rules — what a plan,
// a shrunken list or the thread's own mode does to a pick, and what each
// choice sends — can be tested without a DOM or a request.

import {
  type AiEffortChoice,
  type AiReasoningEffort,
  isEffortAllowed,
  isReasoningEffort,
} from "@engenty/ai-core/browser";
import { toEffortGrant } from "./effort-choices.js";

export const CHAT_MODES = ["normal", "extra", "custom"] as const;
export type ChatMode = (typeof CHAT_MODES)[number];

export interface ChatModePick {
  /**
   * The last Custom model picked. Kept while Normal or Extra is active, so
   * the flyout still shows it checked when the person comes back to it.
   */
  customModel: string | null;
  /** Reasoning level for the Custom model; null = the model's own default. */
  customReasoning: AiReasoningEffort | null;
  /**
   * Reasoning level for Extra, used only when the Extra model takes one;
   * null = the model's own default.
   */
  extraReasoning: AiReasoningEffort | null;
  mode: ChatMode;
}

export const DEFAULT_CHAT_MODE_PICK: ChatModePick = {
  customModel: null,
  customReasoning: null,
  extraReasoning: "high",
  mode: "normal",
};

/** What one Custom list entry must say for the pick rules. */
export interface CustomModelChoice {
  reasoning_effort: boolean;
  ref: string;
}

export function isChatMode(value: unknown): value is ChatMode {
  return (CHAT_MODES as readonly unknown[]).includes(value);
}

function readReasoning(value: unknown): AiReasoningEffort | null {
  return isReasoningEffort(value) ? value : null;
}

/** A stored pick, or null for anything unreadable. */
export function parseChatModePick(value: unknown): ChatModePick | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (!isChatMode(record.mode)) {
    return null;
  }
  return {
    customModel:
      typeof record.customModel === "string" && record.customModel.trim()
        ? record.customModel
        : null,
    customReasoning: readReasoning(record.customReasoning),
    extraReasoning:
      record.extraReasoning === null
        ? null
        : (readReasoning(record.extraReasoning) ??
          DEFAULT_CHAT_MODE_PICK.extraReasoning),
    mode: record.mode,
  };
}

/**
 * The pick a thread's server metadata (`chat_mode`) stands for, on top of
 * `base` (the remembered Custom model and levels). Null when the thread has
 * no mode — it is on Normal.
 */
export function pickFromThreadChatMode(
  chatMode: unknown,
  base: ChatModePick
): ChatModePick | null {
  if (!chatMode || typeof chatMode !== "object" || Array.isArray(chatMode)) {
    return null;
  }
  const record = chatMode as Record<string, unknown>;
  if (record.mode === "extra") {
    return {
      ...base,
      extraReasoning:
        readReasoning(record.reasoning_effort) ?? base.extraReasoning,
      mode: "extra",
    };
  }
  if (
    record.mode === "custom" &&
    typeof record.model_id === "string" &&
    record.model_id.trim()
  ) {
    return {
      ...base,
      customModel: record.model_id,
      customReasoning: readReasoning(record.reasoning_effort),
      mode: "custom",
    };
  }
  return null;
}

/**
 * A thread's pick: what the person just picked for it (the draft) ?? the
 * thread's server `chat_mode` ?? Normal. A draft made before a run on the
 * thread finished steps back once the metadata has been read after that run —
 * the server has recorded the mode by then, and it is the truth.
 */
export function threadChatModePick(input: {
  base: ChatModePick;
  chatMode: unknown;
  draft: { pick: ChatModePick; settledAt: number | null } | undefined;
  /** When the thread's metadata was last read; 0 = never. */
  metadataReadAt: number;
}): { draftSuperseded: boolean; pick: ChatModePick } {
  const { draft } = input;
  const draftSuperseded =
    draft !== undefined &&
    draft.settledAt !== null &&
    input.metadataReadAt > draft.settledAt;
  if (draft && !draftSuperseded) {
    return { draftSuperseded, pick: draft.pick };
  }
  return {
    draftSuperseded,
    pick: pickFromThreadChatMode(input.chatMode, input.base) ?? input.base,
  };
}

/** Extra is the high tier; a plan without it greys Extra out. */
export function isExtraAllowed(
  allowedEfforts: readonly string[] | null | undefined
): boolean {
  return isEffortAllowed("high", toEffortGrant(allowedEfforts));
}

/**
 * The pick a person actually gets. Degrades to Normal instead of refusing: a
 * workspace whose plan drops Extra, or a model taken off the Custom list,
 * should still send — not leave a control stuck on something it cannot run.
 *
 * `customModels` undefined means the list has not loaded; the pick is kept
 * rather than flickering to Normal for a moment on every page load.
 */
export function resolveChatModePick(
  pick: ChatModePick,
  grant: {
    extraAllowed: boolean;
    customModels: readonly CustomModelChoice[] | undefined;
  }
): ChatModePick {
  if (pick.mode === "extra" && !grant.extraAllowed) {
    return { ...pick, mode: "normal" };
  }
  if (pick.mode !== "custom" || grant.customModels === undefined) {
    return pick;
  }
  const model = grant.customModels.find((m) => m.ref === pick.customModel);
  if (!model) {
    return { ...pick, customModel: null, mode: "normal" };
  }
  return model.reasoning_effort ? pick : { ...pick, customReasoning: null };
}

/** What a pick sends with the turn (`forwardedProps.engenty`). */
export interface ChatModeRunConfig {
  effort: AiEffortChoice | null;
  modelId: string | null;
  reasoningEffort: AiReasoningEffort | null;
}

/** A Normal turn the person already declined to move to Extra: never ask again. */
export const DECLINED_OFFER_RUN_CONFIG: ChatModeRunConfig = {
  effort: "normal",
  modelId: null,
  reasoningEffort: null,
};

/**
 * - **Normal** — `auto`: the server may offer Extra for a big turn. On a
 *   thread the server still holds on Extra / Custom, `normal` instead — the
 *   explicit step down (an `auto` turn there would stay on high).
 * - **Extra** — the high tier, at the picked level when the Extra model takes
 *   one (`extraTakesReasoning`; unknown = send none, the model's default).
 * - **Custom** — the picked model, pinned, at its picked reasoning level.
 */
export function chatModeRunConfig(
  pick: ChatModePick,
  context: {
    extraTakesReasoning: boolean | undefined;
    threadHasServerMode: boolean;
  }
): ChatModeRunConfig {
  if (pick.mode === "extra") {
    return {
      effort: "high",
      modelId: null,
      reasoningEffort: context.extraTakesReasoning ? pick.extraReasoning : null,
    };
  }
  if (pick.mode === "custom" && pick.customModel) {
    return {
      effort: null,
      modelId: pick.customModel,
      reasoningEffort: pick.customReasoning,
    };
  }
  return {
    effort: context.threadHasServerMode ? "normal" : "auto",
    modelId: null,
    reasoningEffort: null,
  };
}
