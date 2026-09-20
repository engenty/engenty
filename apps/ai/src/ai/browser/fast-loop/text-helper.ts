// The only generated text in the loop: values for TYPE_TEXT fields. Two
// sources, tried in order and cached per page and goal: the classifier
// picking a span of the goal (`span-picker.ts` — it cannot invent a value),
// then the run's low-tier model (`model.low`, the cheapest general model the
// session already resolved) for a value that has to be rewritten. One LLM
// call per page and goal answers EVERY typeable field on it at once, so a
// three-field form costs one round trip, not three. Strict contract —
// `{ "values": { "<label>": string | null } }`, each under 2000 chars — else
// nothing is typed. Page content is data.

import {
  AI_PLATFORM_ROLES,
  DEFAULT_AI_LOW_MODEL_ID,
  graded,
} from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import type { TypeSafeClient } from "@engenty/typesafe-client";
import { generateText } from "ai";

import { resolveLanguageModel } from "../../../model-gateways/resolve-language-model.js";
import type { HistoryEntry } from "./decide.js";
import { TEXT_VALUES } from "./instructions.js";
import type { PageSnapshot, SnapshotAction } from "./snapshot.js";
import { pickSpans } from "./span-picker.js";

const logger = createLogger({ name: "apps/ai/browser-fast-loop/text" });

const MAX_TEXT_CHARS = 2000;
const MAX_PAGE_TEXT_CHARS = 6000;
/** Pages remembered per helper; a loop rarely revisits more than a few. */
const CACHE_ENTRIES = 8;

export interface FieldDescription {
  label: string;
  role: string | null;
  value: string | null;
}

export interface FieldContext {
  /** The field about to be typed into. */
  field: FieldDescription;
  /** Every typeable field on the page, `field` included; answered together. */
  fields: FieldDescription[];
  goal: string;
  page: { text: string; title: string };
  recent_actions: { action: string; text: string | null }[];
}

function describe(action: SnapshotAction): FieldDescription {
  return {
    label: action.label,
    role: action.role ?? null,
    value: action.value ?? null,
  };
}

export function buildFieldContext(
  goal: string,
  action: SnapshotAction,
  page: PageSnapshot,
  history: readonly HistoryEntry[]
): FieldContext {
  return {
    field: describe(action),
    fields: page.actions.filter((a) => a.kind === "fill").map(describe),
    goal,
    page: { text: page.text.slice(0, MAX_PAGE_TEXT_CHARS), title: page.title },
    recent_actions: history
      .filter((h) => h.kind === "fill")
      .slice(-6)
      .map((h) => ({ action: h.action, text: h.text })),
  };
}

export interface FieldTextResult {
  /** The helper call's own duration; 0 when the value was already known. */
  latency_ms: number;
  model: string;
  /** Who produced the value: the classifier over spans of the goal, or the LLM. */
  source: "span" | "llm";
  /** null = no source found a value in the goal; type nothing. */
  text: string | null;
}

export type FieldTextFn = (context: FieldContext) => Promise<FieldTextResult>;

/**
 * The LLM behind the helper when the run resolved no tier: the `model.low`
 * seed. A run passes its own clamped low-tier binding instead.
 */
export function resolveTextHelperModelId(): string {
  return (
    AI_PLATFORM_ROLES.find((role) => role.role === graded("low"))
      ?.defaultModelId ?? DEFAULT_AI_LOW_MODEL_ID
  );
}

/**
 * The job is copying values out of the goal into labelled fields; a
 * reasoning model spends seconds thinking about it. Reasoning families take
 * an effort knob, a non-reasoning model rejects the parameter, so it is set
 * only where it is understood.
 */
export function reasoningOptions(
  modelId: string
): { openai: { reasoningEffort: "minimal" | "low" } } | undefined {
  const bare = modelId.includes(":")
    ? (modelId.split(":").pop() ?? modelId)
    : modelId;
  if (/^openai\/gpt-5/.test(bare)) {
    return { openai: { reasoningEffort: "minimal" } };
  }
  if (/^openai\/gpt-oss/.test(bare)) {
    return { openai: { reasoningEffort: "low" } };
  }
  return;
}

function parseValuesObject(
  raw: string,
  labels: readonly string[]
): Map<string, string | null> {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const parsed: unknown = JSON.parse(stripped);
  if (
    !parsed ||
    typeof parsed !== "object" ||
    Object.keys(parsed).length !== 1 ||
    !("values" in parsed)
  ) {
    throw new Error("text_helper_invalid_shape");
  }
  const values = (parsed as { values: unknown }).values;
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    throw new Error("text_helper_invalid_shape");
  }
  const out = new Map<string, string | null>();
  for (const label of labels) {
    const value = (values as Record<string, unknown>)[label];
    if (value === null || value === undefined) {
      out.set(label, null);
      continue;
    }
    if (
      typeof value !== "string" ||
      !value.trim() ||
      value.length > MAX_TEXT_CHARS
    ) {
      throw new Error("text_helper_invalid_value");
    }
    out.set(label, value);
  }
  return out;
}

/**
 * One page's worth of values is asked for once: the key is the goal plus the
 * fields as they stand, so a field the loop just filled (its value changed)
 * asks again with the new state, and a revisit of an unchanged page is free.
 */
function cacheKey(context: FieldContext): string {
  return JSON.stringify([context.goal, context.page.title, context.fields]);
}

export interface FieldTextOptions {
  /** The LLM for values the span picker cannot supply. */
  modelId?: string;
  /** The classifier that picks spans of the goal; omit to go straight to the LLM. */
  spans?: { client: TypeSafeClient; model?: string } | null;
}

interface Known {
  latency_ms: number;
  source: FieldTextResult["source"];
  text: string | null;
}

export function createFieldText(options: FieldTextOptions = {}): FieldTextFn {
  const modelId = options.modelId ?? resolveTextHelperModelId();
  const spans = options.spans ?? null;
  const cache = new Map<string, Map<string, Known>>();
  /** Keys whose span pick already ran (with or without a value). */
  const spansAsked = new Set<string>();
  const inflight = new Map<string, Promise<void>>();

  const remember = (key: string): Map<string, Known> => {
    let entry = cache.get(key);
    if (!entry) {
      entry = new Map();
      cache.set(key, entry);
      if (cache.size > CACHE_ENTRIES) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) {
          cache.delete(oldest);
          spansAsked.delete(oldest);
        }
      }
    }
    return entry;
  };

  const askSpans = async (key: string, context: FieldContext) => {
    if (!spans || spansAsked.has(key)) {
      return;
    }
    spansAsked.add(key);
    try {
      const pick = await pickSpans({
        client: spans.client,
        context,
        ...(spans.model ? { model: spans.model } : {}),
      });
      if (!pick) {
        return;
      }
      const known = remember(key);
      for (const [label, text] of pick.values) {
        if (text !== null) {
          known.set(label, {
            latency_ms: pick.latency_ms,
            source: "span",
            text,
          });
        }
      }
    } catch (error) {
      logger.warn("span picker failed; falling back to the model", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const askModel = async (key: string, context: FieldContext) => {
    const labels = context.fields.map((f) => f.label);
    if (!labels.includes(context.field.label)) {
      labels.push(context.field.label);
    }
    const startedAt = performance.now();
    const providerOptions = reasoningOptions(modelId);
    const { text } = await generateText({
      instructions: TEXT_VALUES,
      maxOutputTokens: 1024,
      model: resolveLanguageModel(modelId),
      prompt: JSON.stringify({
        fields: context.fields,
        goal: context.goal,
        page: context.page,
        recent_actions: context.recent_actions,
      }),
      ...(providerOptions ? { providerOptions } : {}),
      temperature: 0,
    });
    const latency_ms = Math.round(performance.now() - startedAt);
    let values: Map<string, string | null>;
    try {
      values = parseValuesObject(text, labels);
    } catch (error) {
      logger.warn("text helper returned no usable field values", {
        message: error instanceof Error ? error.message : String(error),
        model: modelId,
      });
      throw new Error(
        "text_helper_invalid: no valid field value; nothing typed"
      );
    }
    const known = remember(key);
    for (const [label, value] of values) {
      if (!known.has(label)) {
        known.set(label, { latency_ms, source: "llm", text: value });
      }
    }
  };

  const resolve = async (key: string, context: FieldContext) => {
    await askSpans(key, context);
    if (cache.get(key)?.has(context.field.label)) {
      return;
    }
    await askModel(key, context);
  };

  return async (context) => {
    const key = cacheKey(context);
    const label = context.field.label;
    const hit = cache.get(key)?.get(label);
    if (hit) {
      return {
        latency_ms: 0,
        model: modelId,
        source: hit.source,
        text: hit.text,
      };
    }
    let pending = inflight.get(key);
    if (!pending) {
      pending = resolve(key, context).finally(() => inflight.delete(key));
      inflight.set(key, pending);
    }
    await pending;
    const known = cache.get(key)?.get(label);
    if (!known) {
      // Another field's in-flight call did not cover this label (the page
      // changed between them); ask once more for this page as it stands.
      await resolve(key, context);
    }
    const found = cache.get(key)?.get(label);
    return {
      latency_ms: found?.latency_ms ?? 0,
      model: modelId,
      source: found?.source ?? "llm",
      text: found?.text ?? null,
    };
  };
}
