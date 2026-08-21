"use client";

import { useTranslation } from "@engenty/i18n/ui";
import { cn } from "@engenty/ui-core";
import { Check, Shield, X } from "lucide-react";
import type { ToolApprovalResolution } from "../../../ag-ui/tool-approval.js";

/**
 * An answered tool approval, as it reads later.
 *
 * The approve/deny card is a security surface: what the transcript has to keep
 * is WHICH operation the user let through (or refused), and that is all the
 * resolution payload still carries once it has overwritten the artifact. Before
 * this the row fell through to the generic tool card — a line labelled
 * "Decision needed" hiding a raw `approved: true` behind a chevron, which named
 * neither the verdict nor the operation.
 */
export function ToolApprovalResolvedCard(props: {
  resolution: ToolApprovalResolution;
}) {
  const { t } = useTranslation("common");
  const { approved, operationIds } = props.resolution;
  // The shield says "this row is an approval" and nothing more — it stays
  // neutral, because a coloured shield reads as an alert about the operation.
  // The VERDICT is what carries colour: green check, red cross.
  const VerdictIcon = approved ? Check : X;
  const title = approved
    ? t("copilot.toolApproval.approved", { defaultValue: "Approved" })
    : t("copilot.toolApproval.denied", { defaultValue: "Denied" });

  return (
    <section className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-1.5">
      <Shield
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground"
      />
      <p className="flex min-w-0 items-center gap-1.5 text-sm">
        <VerdictIcon
          aria-hidden="true"
          className={cn(
            "size-3.5 shrink-0",
            approved
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-destructive"
          )}
        />
        <span className="font-medium text-foreground/90">{title}</span>
        <span className="truncate text-muted-foreground text-xs">
          {operationIds.join(", ")}
        </span>
      </p>
    </section>
  );
}
