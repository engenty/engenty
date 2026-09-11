"use client";

/**
 * What a proposed App version asks for, grouped by consequence — once.
 *
 * Two surfaces say this: the consent banner above the App, which opens each
 * group and reads the lines, and the Space-home card, which names the groups
 * in a single line and leaves the reading to the banner. They must use the
 * SAME words and the SAME icons, or the card promises one thing and the
 * decision screen shows another.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { Database, Globe, HardDrive, ShieldAlert, Table2 } from "lucide-react";
import type { AppReviewDetail } from "./app-review-api.js";

export type AppReviewScopeKind =
  | "egress"
  | "highRisk"
  | "operations"
  | "storage"
  | "tables";

/** One permission, as a sentence — with the identifier to search for later. */
export interface AppReviewScopeLine {
  id?: string;
  label: string;
}

export interface AppReviewScopeGroup {
  count: number;
  key: string;
  kind: AppReviewScopeKind;
  lines: AppReviewScopeLine[];
  title: string;
}

export function AppReviewScopeIcon({
  className,
  kind,
}: {
  className?: string;
  kind: AppReviewScopeKind;
}) {
  const Icon =
    kind === "tables"
      ? Table2
      : kind === "egress"
        ? Globe
        : kind === "storage"
          ? HardDrive
          : kind === "highRisk"
            ? ShieldAlert
            : Database;
  return <Icon aria-hidden className={className} />;
}

export function useAppReviewScopeGroups(
  review: AppReviewDetail | null | undefined
): AppReviewScopeGroup[] {
  const { t } = useTranslation("ai-ui");
  if (!review) {
    return [];
  }
  const groups: AppReviewScopeGroup[] = [];

  // Operations are grouped by the module or connector they belong to:
  // `gmail_send_message` and `contacts_list` look alike in a flat list, and
  // which product they touch is the part a person recognises.
  const byModule = new Map<string, AppReviewDetail["operations"]>();
  for (const operation of review.operations) {
    const key = operation.module ?? "";
    const list = byModule.get(key) ?? [];
    list.push(operation);
    byModule.set(key, list);
  }
  for (const [module, operations] of byModule) {
    groups.push({
      count: operations.length,
      key: `operations:${module || "engenty"}`,
      kind: "operations",
      lines: operations.map((operation) => ({
        id: operation.id,
        label: operation.summary ?? operation.id,
      })),
      title: module
        ? t("appReview.groupModule", {
            defaultValue: "Work in {{module}}",
            module,
          })
        : t("appReview.groupEngenty", { defaultValue: "Work in engenty" }),
    });
  }

  if (review.tables.length > 0) {
    groups.push({
      count: review.tables.length,
      key: "tables",
      kind: "tables",
      lines: review.tables.map((table) => ({
        label:
          table.title ??
          t("appReview.tableUnnamed", { defaultValue: "An unnamed table" }),
      })),
      title: t("appReview.groupTables", {
        defaultValue: "Read and write these tables",
      }),
    });
  }

  if (review.egress.length > 0) {
    groups.push({
      count: review.egress.length,
      key: "egress",
      kind: "egress",
      lines: review.egress.map((host) => ({ label: host })),
      title: t("appReview.groupEgress", {
        defaultValue: "Reach these addresses on the internet",
      }),
    });
  }

  const storageKinds = [
    review.storage?.config
      ? t("appReview.storageConfig", { defaultValue: "its settings" })
      : null,
    review.storage?.data
      ? t("appReview.storageData", { defaultValue: "its own data volume" })
      : null,
  ].filter((entry): entry is string => Boolean(entry));
  if (storageKinds.length > 0) {
    groups.push({
      count: storageKinds.length,
      key: "storage",
      kind: "storage",
      lines: storageKinds.map((label) => ({ label })),
      title: t("appReview.groupStorage", {
        defaultValue: "Keep files of its own",
      }),
    });
  }

  // Last, and the only one the banner opens on its own: these do not become
  // silent once activated — they ask again, every time.
  const highRisk = review.actions.filter(
    (action) => action.risk === "high" || action.requiresApproval === true
  );
  if (highRisk.length > 0) {
    groups.push({
      count: highRisk.length,
      key: "highRisk",
      kind: "highRisk",
      lines: highRisk.map((action) => ({
        id: action.id,
        label: action.summary ?? action.id,
      })),
      title: t("appReview.groupHighRisk", {
        defaultValue: "Ask you again every single time",
      }),
    });
  }

  return groups;
}
