import { useMemo } from "react";
import type { AuditLogLabels } from "../types.js";

/** Translation function signature (e.g. from useTranslation). */
export type TranslateFn = (key: string) => string;

/**
 * Build audit log labels from translation function.
 * Expects keys under "auditLogs.*" in the common namespace.
 */
export function useAuditLogLabels(t: TranslateFn): AuditLogLabels {
  return useMemo(
    () => ({
      searchPlaceholder: t("auditLogs.searchPlaceholder"),
      from: t("auditLogs.from"),
      to: t("auditLogs.to"),
      targetType: t("auditLogs.targetType"),
      allTypes: t("auditLogs.allTypes"),
      clearFilters: t("auditLogs.clearFilters"),
      feedPaused: t("auditLogs.feedPaused"),
      newEvents: t("auditLogs.newEvents"),
      resume: t("auditLogs.resume"),
      noLogs: t("auditLogs.noLogs"),
      entries: t("auditLogs.entries"),
      realtimeConnected: t("auditLogs.realtimeConnected"),
      metadata: t("auditLogs.metadata"),
      columnTime: t("auditLogs.columnTime"),
      columnStatus: t("auditLogs.columnStatus"),
      columnActor: t("auditLogs.columnActor"),
      columnEvent: t("auditLogs.columnEvent"),
      columnSource: t("auditLogs.columnSource"),
    }),
    [t]
  );
}
