/**
 * An App built and waiting to be activated, as a notice on its card.
 *
 * The one verdict the home can take by itself. Every other parked job here
 * opens the conversation, because answering it resumes an AG-UI stream that
 * only the chat can hold; `apps.approve` is a plain decision on the App, so a
 * button on the card IS the decision — not a weaker copy of one.
 *
 * It is framed rather than listed: a card's other rows report what an engenty
 * is doing, and this one asks the person for something. What it asks for is
 * named with the SAME icons and words the consent banner uses, on one line —
 * the card says what kind of power is being granted, the banner reads out
 * every line of it. Both come from `useAppReviewScopeGroups`, and the counts
 * come from the query the banner already holds, so the two cannot drift.
 */
import {
  AppReviewScopeIcon,
  activateArtifact,
  type SpaceHomeAppRelease,
  useAppReviewDecision,
  useAppReviewQuery,
  useAppReviewScopeGroups,
} from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { useNavigate } from "react-router-dom";

export function SpaceHomeAppReleaseRow({
  hostKey,
  release,
  target,
}: {
  /** The conversation's artifact-pane key, when it has one. */
  hostKey: string | null;
  release: SpaceHomeAppRelease;
  /** Where the conversation lives, search included. */
  target: string;
}) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const reviewQuery = useAppReviewQuery(release.app_id, release.version);
  const review = reviewQuery.data?.review;
  const groups = useAppReviewScopeGroups(review);
  const decide = useAppReviewDecision({
    appId: release.app_id,
    reviewVersion: review?.version,
    version: release.version,
  });

  return (
    <div className="pointer-events-auto my-1 rounded-[10px] border border-amber-500/40 bg-amber-500/5 px-3.5 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-[13.5px] text-foreground leading-relaxed">
            {t("spaces.home.cards.appReleaseLine", {
              defaultValue:
                "“{{name}}” v{{version}} is waiting to be activated.",
              name: release.name,
              version: release.version,
            })}
          </p>
          {groups.length > 0 ? (
            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-muted-foreground">
              {groups.map((group, index) => (
                <span
                  className="inline-flex items-center gap-1"
                  key={group.key}
                >
                  <AppReviewScopeIcon className="size-3.5" kind={group.kind} />
                  {group.title}
                  {index < groups.length - 1 ? "," : null}
                </span>
              ))}
            </p>
          ) : null}
          {decide.isError ? (
            <p className="mt-1.5 text-[12px] text-destructive">
              {decide.error instanceof Error
                ? decide.error.message
                : t("spaces.home.cards.appDecisionFailed", {
                    defaultValue: "The decision could not be recorded.",
                  })}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {reviewQuery.data?.can_approve ? (
            <>
              <Button
                disabled={decide.isPending}
                onClick={() => decide.mutate("approve")}
                size="sm"
              >
                {t("spaces.home.cards.appApprove", {
                  defaultValue: "Activate",
                })}
              </Button>
              <Button
                disabled={decide.isPending}
                onClick={() => decide.mutate("reject")}
                size="sm"
                variant="outline"
              >
                {t("spaces.home.cards.appReject", { defaultValue: "Reject" })}
              </Button>
            </>
          ) : null}
          {/* The conversation that asked for the App, with the App itself in
              that conversation's artifact panel. The Data tab could show it
              too, but stripped of the exchange that explains why it exists —
              and closing it there left you in a file list you never opened.
              The pane's state is set before navigating; the desk reads it when
              it mounts. */}
          <Button
            onClick={() => {
              if (hostKey) {
                activateArtifact(hostKey, release.artifact_id);
              }
              navigate(target);
            }}
            size="sm"
            variant="ghost"
          >
            {t("spaces.home.cards.appOpen", { defaultValue: "Look at it" })}
          </Button>
        </div>
      </div>
    </div>
  );
}
