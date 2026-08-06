import type { AiEffort } from "@engenty/ai-core/browser";
import {
  type EffortResolvedFlash,
  publishEffortResolvedFlash,
} from "./effort-resolved-flash.js";

/**
 * Handle a live `engenty.effort.resolved` CUSTOM event by flashing the effort
 * control. The composer (CopilotEffortControl) toasts when the flash changes
 * and the resolved tier/model differs from the last one shown.
 */
export function notifyEffortResolved(input: {
  effort: AiEffort;
  hostKey: string;
  modelId?: string | null;
  reason?: string;
  source?: string;
}): EffortResolvedFlash {
  return publishEffortResolvedFlash(input.hostKey, {
    effort: input.effort,
    modelId: input.modelId,
    reason: input.reason,
    source: input.source,
  });
}
