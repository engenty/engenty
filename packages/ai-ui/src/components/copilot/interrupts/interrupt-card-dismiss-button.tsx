"use client";

import { useTranslation } from "@engenty/i18n/ui";
import { X } from "lucide-react";

/**
 * The ✕ on a decision / approval / command card: closes the card without
 * answering it. The run stays parked; the next user turn supersedes it.
 */
export function InterruptCardDismissButton(props: {
  disabled?: boolean;
  onDismiss: () => void;
}) {
  const { t } = useTranslation("common");
  const label = t("copilot.interruptCard.dismiss", {
    defaultValue: "Dismiss without answering",
  });
  return (
    <button
      aria-label={label}
      className="-mt-1 -mr-1 flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
      disabled={props.disabled}
      onClick={props.onDismiss}
      title={label}
      type="button"
    >
      <X aria-hidden className="size-3.5" />
    </button>
  );
}
