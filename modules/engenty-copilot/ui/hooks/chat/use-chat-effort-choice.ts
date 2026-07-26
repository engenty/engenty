import type { AiEffortChoice } from "@engenty/ai-core/browser";
import { resolveEffortChoice, useEffortGrant } from "@engenty/ai-ui";
import { useCallback, useState } from "react";

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

function isChoice(value: string | null): value is AiEffortChoice {
  return (
    value === "auto" ||
    value === "low" ||
    value === "medium" ||
    value === "high"
  );
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
  const [stored, setStored] = useState<AiEffortChoice>(() => {
    const raw = readStored(EFFORT_STORAGE_KEY);
    return isChoice(raw) ? raw : "auto";
  });
  const [expertModels, setExpertModels] = useState(
    () => readStored(EXPERT_STORAGE_KEY) === "true"
  );

  const setEffort = useCallback((choice: AiEffortChoice) => {
    setStored(choice);
    writeStored(EFFORT_STORAGE_KEY, choice);
  }, []);

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
    setEffort,
    toggleExpertModels,
  };
}
