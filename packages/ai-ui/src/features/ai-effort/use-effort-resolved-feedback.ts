"use client";

import { useTranslation } from "@engenty/i18n/ui";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  type EffortResolvedFlash,
  useEffortResolvedFlash,
} from "./effort-resolved-flash.js";

/**
 * Subscribe to Auto effort flashes for a host: toast when the resolved
 * tier/model changes, and return the active flash for the effort selector.
 */
export function useEffortResolvedFeedback(
  hostKey: string
): EffortResolvedFlash | null {
  const { t } = useTranslation("ai-ui");
  const flash = useEffortResolvedFlash(hostKey);
  const lastToastedKey = useRef<string | null>(null);

  useEffect(() => {
    if (!flash) {
      return;
    }
    const key = `${flash.effort}|${flash.modelId?.trim() || ""}`;
    if (lastToastedKey.current === key) {
      return;
    }
    lastToastedKey.current = key;
    const effortLabel = t(`effort.choice.${flash.effort}.label`);
    const model = flash.modelId?.trim();
    if (model) {
      toast.message(
        t("effort.autoResolvedWithModel", { effort: effortLabel, model })
      );
    } else {
      toast.message(t("effort.autoResolved", { effort: effortLabel }));
    }
  }, [flash, t]);

  return flash;
}
