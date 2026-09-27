import type { AiEffortChoice } from "@engenty/ai-core/browser";
import { useCallback, useState, useSyncExternalStore } from "react";
import { AI_EFFORT_CHOICES, resolveEffortChoice } from "./effort-choices.js";
import { useEffortGrant } from "./use-effort-grant.js";

const EFFORT_STORAGE_KEY = "engenty.copilot.effort";
const EXPERT_STORAGE_KEY = "engenty.copilot.effort.expert";

function readStored(key: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Private-mode / blocked storage: fall back to the session default rather
    // than breaking the composer.
    return null;
  }
}

function writeStored(key: string, value: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Persisting the preference is a nicety; losing it must not throw mid-send.
  }
}

export function isEffortChoice(value: string | null): value is AiEffortChoice {
  return (AI_EFFORT_CHOICES as readonly (string | null)[]).includes(value);
}

// One pick for the whole page: every lane's effort pill and `/effort` read and
// write the same value, so a change in one shows in all of them at once.
let storedEffort: AiEffortChoice | null = null;
const effortListeners = new Set<() => void>();

function readEffort(): AiEffortChoice {
  if (storedEffort === null) {
    const raw = readStored(EFFORT_STORAGE_KEY);
    storedEffort = isEffortChoice(raw) ? raw : "auto";
  }
  return storedEffort;
}

function subscribeEffort(listener: () => void): () => void {
  effortListeners.add(listener);
  return () => {
    effortListeners.delete(listener);
  };
}

/** Sets the person's effort pick — the composer pill's `onChange` and `/effort`. */
export function setChatEffortChoice(choice: AiEffortChoice): void {
  storedEffort = choice;
  writeStored(EFFORT_STORAGE_KEY, choice);
  for (const listener of effortListeners) {
    listener();
  }
}

/**
 * The composer's effort pick, plus the expert escape hatch that reveals the
 * model-id chooser.
 *
 * The stored choice is re-clamped against the plan on every read: a workspace
 * that drops to a cheaper plan should quietly get the tier it is entitled to,
 * not a control stuck on a tier it can no longer buy.
 */
export function useChatEffortChoice() {
  const { allowedEfforts } = useEffortGrant();
  const stored = useSyncExternalStore(
    subscribeEffort,
    readEffort,
    () => "auto" as const
  );
  const [expertModels, setExpertModels] = useState(
    () => readStored(EXPERT_STORAGE_KEY) === "true"
  );

  const toggleExpertModels = useCallback(() => {
    setExpertModels((previous) => {
      writeStored(EXPERT_STORAGE_KEY, String(!previous));
      return !previous;
    });
  }, []);

  return {
    allowedEfforts,
    effort: resolveEffortChoice(stored, allowedEfforts),
    expertModels,
    setEffort: setChatEffortChoice,
    toggleExpertModels,
  };
}
