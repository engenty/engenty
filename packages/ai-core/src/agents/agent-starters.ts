/**
 * Starter chips declared with an agent (`agent.json` / `AgentConfig.starters`).
 *
 * Authoring rules:
 * 1. A starter is a **job**, not a greeting: "Turn last week's calendar into hours",
 *    not "Help with time".
 * 2. It must be answerable with the tools the agent actually declares. A starter
 *    that dead-ends into "I can't do that" is worse than no chip.
 * 3. ≤ 40 chars on the chip; the prompt is a full sentence.
 * 4. Ship `en` (`label` / `prompt`) + `locales.de`. Agent `name` / `description`
 *    stay untranslated literals today — starters are the most visible strings
 *    on the page, so they get German.
 */
import { z } from "zod";

/** Chips shown on the start page (plus the framework "What can you do?"). */
export const AGENT_STARTER_MAX = 3;
/** Declared on the agent; Phase 3 filters then slices to {@link AGENT_STARTER_MAX}. */
export const AGENT_STARTER_DECLARE_MAX = 6;
export const AGENT_STARTER_WHAT_CAN_YOU_DO_ID = "what-can-you-do";

export const agentStarterConditionSchema = z.object({
  /** Only when this connector id is mounted on the space. */
  connector: z.string().min(1).optional(),
  /** Only when this module is mounted with `agentAccess !== "none"`. */
  module: z.string().min(1).optional(),
  hasOpenTasks: z.boolean().optional(),
  /** `true` when the agent has no threads in this space yet. */
  firstVisit: z.boolean().optional(),
});

export const agentStarterSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(48),
  prompt: z.string().min(1).max(400),
  /** Per-locale overrides; `label` / `prompt` above are the en/default. */
  locales: z
    .record(
      z.string(),
      z.object({
        label: z.string().min(1).max(48),
        prompt: z.string().min(1).max(400),
      })
    )
    .optional(),
  when: agentStarterConditionSchema.optional(),
});

export type AgentStarterCondition = z.infer<typeof agentStarterConditionSchema>;
export type AgentStarter = z.infer<typeof agentStarterSchema>;

export interface ResolvedAgentStarter {
  id: string;
  label: string;
  prompt: string;
}

export interface AgentStarterContext {
  connectors: readonly string[];
  firstVisit: boolean;
  hasOpenTasks: boolean;
  modules: readonly { agentAccess: string; moduleId: string }[];
  spaceName?: string;
  userFirstName?: string;
}

function localeCandidates(locale: string): string[] {
  const trimmed = locale.trim();
  if (!trimmed) {
    return [];
  }
  const lower = trimmed.toLowerCase();
  const base = lower.split("-")[0];
  return base && base !== lower ? [trimmed, lower, base] : [trimmed, lower];
}

function pickLocalized(
  starter: AgentStarter,
  locale: string
): { label: string; prompt: string } {
  const locales = starter.locales;
  if (!locales) {
    return { label: starter.label, prompt: starter.prompt };
  }
  for (const key of localeCandidates(locale)) {
    const hit =
      locales[key] ??
      Object.entries(locales).find(([id]) => id.toLowerCase() === key)?.[1];
    if (hit) {
      return hit;
    }
  }
  return { label: starter.label, prompt: starter.prompt };
}

export function interpolateAgentStarterText(
  text: string,
  context: Pick<AgentStarterContext, "spaceName" | "userFirstName">
): string {
  return text
    .replaceAll("{space}", context.spaceName?.trim() || "")
    .replaceAll("{user_first_name}", context.userFirstName?.trim() || "")
    .replaceAll(/\s{2,}/g, " ")
    .trim();
}

export function resolveAgentStarters(
  starters: readonly AgentStarter[],
  locale: string
): Array<ResolvedAgentStarter & { when?: AgentStarterCondition }> {
  return starters.map((starter) => {
    const localized = pickLocalized(starter, locale);
    return {
      id: starter.id,
      label: localized.label,
      prompt: localized.prompt,
      ...(starter.when ? { when: starter.when } : {}),
    };
  });
}

export function starterMatchesContext(
  when: AgentStarterCondition | undefined,
  context: AgentStarterContext
): boolean {
  if (!when) {
    return true;
  }
  if (
    when.connector &&
    !context.connectors.some((id) => id === when.connector)
  ) {
    return false;
  }
  if (when.module) {
    const mounted = context.modules.some(
      (module) =>
        module.moduleId === when.module && module.agentAccess !== "none"
    );
    if (!mounted) {
      return false;
    }
  }
  if (
    when.hasOpenTasks !== undefined &&
    when.hasOpenTasks !== context.hasOpenTasks
  ) {
    return false;
  }
  if (when.firstVisit !== undefined && when.firstVisit !== context.firstVisit) {
    return false;
  }
  return true;
}

/**
 * Locale → conditions → placeholders → at most {@link AGENT_STARTER_MAX} chips.
 */
export function selectAgentDeskStarters(
  starters: readonly AgentStarter[],
  locale: string,
  context: AgentStarterContext
): ResolvedAgentStarter[] {
  const selected: ResolvedAgentStarter[] = [];
  const seen = new Set<string>();
  for (const starter of resolveAgentStarters(starters, locale)) {
    if (!starterMatchesContext(starter.when, context) || seen.has(starter.id)) {
      continue;
    }
    seen.add(starter.id);
    selected.push({
      id: starter.id,
      label: interpolateAgentStarterText(starter.label, context),
      prompt: interpolateAgentStarterText(starter.prompt, context),
    });
    if (selected.length >= AGENT_STARTER_MAX) {
      break;
    }
  }
  return selected;
}

/**
 * Generated chips are additions. A declared catalogue entry with the same `id`
 * always wins. Result is capped at {@link AGENT_STARTER_MAX} job chips.
 */
export function mergeGeneratedStarters(
  declared: readonly ResolvedAgentStarter[],
  generated: readonly ResolvedAgentStarter[]
): ResolvedAgentStarter[] {
  const merged: ResolvedAgentStarter[] = [];
  const seen = new Set<string>();
  for (const starter of [...declared, ...generated]) {
    if (!starter.id || seen.has(starter.id)) {
      continue;
    }
    seen.add(starter.id);
    merged.push(starter);
    if (merged.length >= AGENT_STARTER_MAX) {
      break;
    }
  }
  return merged;
}
