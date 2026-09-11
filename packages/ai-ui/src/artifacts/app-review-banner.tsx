"use client";

/**
 * The consent surface: what a proposed App version asks for, in sentences.
 *
 * It used to be one run of chips — `expenses · expenses_list`, `table ·
 * 01a0862f-…` — which named identifiers, not consequences. A person deciding
 * needs to read what the App will be ABLE TO DO, so the manifest is grouped
 * the way it lands on them: what it reads and writes, whose tables, where it
 * may reach on the network, what it keeps, and what will still ask every time.
 *
 * Every line's words already existed and were thrown away: the operation
 * contract's `summary`, the table's `title`, the action's `summary`. The ids
 * stay, quietly, beside them — an id is what you search for afterwards.
 *
 * Holders of `apps.approve` get the buttons; everyone else is told who is
 * being waited on. Core re-checks the capability on the decision call, so this
 * banner is honesty, not enforcement.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn } from "@engenty/ui-core";
import { ChevronDown } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useAppReviewDecision, useAppReviewQuery } from "./app-review-api.js";
import {
  AppReviewScopeIcon,
  useAppReviewScopeGroups,
} from "./app-review-scopes.js";

/**
 * One consequence group: an icon, a heading, how many things are under it, and
 * a chevron to read them.
 *
 * Closed by default, so the banner is a list of five sentences you can take in
 * at a glance and the App below it stays visible. The heading already says
 * what kind of power this is and the count says how much of it — opening is
 * for when you want the individual lines. What will ask again every time is
 * the exception: that one is open, because it is the part a person most needs
 * to have actually read.
 */
function ScopeGroup({
  children,
  count,
  defaultOpen = false,
  icon,
  title,
  tone = "default",
}: {
  children: ReactNode;
  count: number;
  defaultOpen?: boolean;
  icon: ReactNode;
  title: string;
  tone?: "default" | "warning";
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="py-0.5">
      <button
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-md py-1.5 text-left transition-colors hover:bg-muted/60"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span
          aria-hidden
          className={cn(
            "shrink-0",
            tone === "warning" ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {icon}
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 font-medium text-[13px]",
            tone === "warning" ? "text-destructive" : "text-foreground"
          )}
        >
          {title}
        </span>
        <span className="shrink-0 text-[12px] text-muted-foreground tabular-nums">
          {count}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open ? "rotate-180" : null
          )}
        />
      </button>
      {open ? (
        <ul className="mt-0.5 flex flex-col gap-0.5 pb-1.5 pl-[26px]">
          {children}
        </ul>
      ) : null}
    </div>
  );
}

/** A single permission: its sentence, with the identifier kept beside it. */
function ScopeLine({ id, label }: { id?: string; label: string }) {
  return (
    <li className="text-[12.5px] text-muted-foreground leading-relaxed">
      {label}
      {id && id !== label ? (
        <span className="ml-1.5 font-mono text-[11px] text-muted-foreground/70">
          {id}
        </span>
      ) : null}
    </li>
  );
}

export function AppReviewBanner({
  appId,
  version,
}: {
  appId: string;
  version?: number;
}) {
  const { t } = useTranslation("ai-ui");
  const reviewQuery = useAppReviewQuery(appId, version);
  const review = reviewQuery.data?.review;
  const groups = useAppReviewScopeGroups(review);
  const decide = useAppReviewDecision({
    appId,
    reviewVersion: review?.version,
    version,
  });

  if (review?.status !== "proposed") {
    return null;
  }

  return (
    // The bar spans the surface; what you READ inside it does not. In the
    // Space's data pane this banner is as wide as the window, and a consent
    // sentence stretched over 1600px is a sentence nobody finishes.
    <div className="border-b bg-muted/40 px-4 py-3 text-sm">
      <div className="mx-auto w-full max-w-3xl">
        <p className="font-medium">
          {t("appReview.headline", {
            defaultValue: "Release {{version}} ({{sha}}) is waiting for you.",
            sha: review.sha.slice(0, 7),
            version: review.version,
          })}
        </p>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">
          {groups.length === 0
            ? t("appReview.asksNothing", {
                defaultValue:
                  "Once activated, this app runs in its own frame and reaches nothing else.",
              })
            : t("appReview.asksIntro", {
                defaultValue: "Once activated, this app will be able to:",
              })}
        </p>

        {groups.length === 0 ? null : (
          <div className="mt-1.5 divide-y divide-border/60">
            {groups.map((group) => (
              <ScopeGroup
                count={group.count}
                defaultOpen={group.kind === "highRisk"}
                icon={
                  <AppReviewScopeIcon className="size-4" kind={group.kind} />
                }
                key={group.key}
                title={group.title}
                tone={group.kind === "highRisk" ? "warning" : "default"}
              >
                {group.lines.map((line) => (
                  <ScopeLine
                    key={`${line.id ?? ""}${line.label}`}
                    label={line.label}
                    {...(line.id ? { id: line.id } : {})}
                  />
                ))}
              </ScopeGroup>
            ))}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 text-[12px] text-muted-foreground">
            {t("appReview.trust", {
              defaultValue:
                "Activate it only if you trust what it was built to do. You can reject it and ask for changes.",
            })}
          </p>
          {reviewQuery.data?.can_approve ? (
            <div className="flex shrink-0 gap-2">
              <Button
                disabled={decide.isPending}
                onClick={() => decide.mutate("approve")}
                size="sm"
              >
                {t("appReview.approve", { defaultValue: "Activate" })}
              </Button>
              <Button
                disabled={decide.isPending}
                onClick={() => decide.mutate("reject")}
                size="sm"
                variant="outline"
              >
                {t("appReview.reject", { defaultValue: "Reject" })}
              </Button>
            </div>
          ) : (
            <span className="shrink-0 text-muted-foreground text-xs">
              {t("appReview.waitingForApprover", {
                defaultValue: "Waiting for someone who may approve",
              })}
            </span>
          )}
        </div>
        {decide.isError ? (
          <p className="mt-2 text-destructive text-xs">
            {decide.error instanceof Error
              ? decide.error.message
              : t("appReview.decisionFailed", {
                  defaultValue: "The decision could not be recorded.",
                })}
          </p>
        ) : null}
      </div>
    </div>
  );
}
