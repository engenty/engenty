// The "screen" beside the chat (PLAN-user-browser.md §2.6): the agent's
// window in its Space's browser (the copilot's: the personal Space's) — its
// state, a Start when there is none, and the live view with takeover when it
// runs. Opened from
// the monitor button in the copilot header (card), or hosted inside the
// desk's browser pane, whose top bar carries the title and close (pane).
import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn } from "@engenty/ui-core";
import { Globe, Pause, Play } from "lucide-react";
import { createPortal } from "react-dom";
import { useBrowserTarget } from "./browser-target.js";
import {
  useUserBrowserMutations,
  useUserBrowserStatusQuery,
} from "./user-browser-api.js";
import { UserBrowserView } from "./user-browser-view.js";

export function CopilotBrowserPanel({
  chromeSlot,
  variant = "card",
}: {
  /**
   * The pane's top bar. The live view puts its tab strip there; with no
   * browser running the panel puts the pane's name there instead.
   */
  chromeSlot?: HTMLElement | null;
  /**
   * `card` sits inside a chat column with its own title row; `pane` fills
   * the desk's browser pane, whose top bar already names and closes it.
   */
  variant?: "card" | "pane";
}) {
  const { t } = useTranslation("ai-ui");
  const target = useBrowserTarget();
  if (!target) {
    throw new Error("CopilotBrowserPanel needs a BrowserTargetProvider");
  }
  const status = useUserBrowserStatusQuery(target, 30_000);
  const { start, stop } = useUserBrowserMutations(target);
  const state = status.data?.state ?? "absent";
  const busy = start.isPending || stop.isPending;
  const running = state === "running";
  // In the pane the view's own toolbar carries Stop; the state row is for
  // the card, and for the pane while there is nothing to show yet.
  const viewOwnsToolbar = variant === "pane" && running;

  return (
    <section
      aria-label={t("browser.panel.title")}
      className={
        variant === "pane"
          ? cn(
              "flex min-h-0 flex-1 flex-col",
              // Running, the view fills the pane edge to edge; the chrome it
              // needs lives in the pane's top bar.
              running ? "overflow-hidden" : "gap-3 overflow-y-auto px-3 py-2"
            )
          : "flex min-h-0 flex-col gap-2 rounded-lg border bg-muted/30 p-2"
      }
      data-copilot-browser-panel
    >
      {chromeSlot && !running
        ? createPortal(
            <>
              <Globe
                aria-hidden
                className="ml-1.5 size-4 shrink-0 text-muted-foreground"
              />
              <span className="min-w-0 truncate px-1 font-medium text-sm">
                {t("browser.panel.title")}
              </span>
            </>,
            chromeSlot
          )
        : null}
      {viewOwnsToolbar ? null : (
        <div className="flex h-8 items-center gap-2">
          {variant === "card" ? (
            <>
              <Globe
                aria-hidden
                className="size-4 shrink-0 text-muted-foreground"
              />
              <span className="min-w-0 truncate font-medium text-sm">
                {t("browser.panel.title")}
              </span>
            </>
          ) : null}
          <span className="min-w-0 flex-1 truncate text-muted-foreground text-xs">
            {t(`browser.panel.state.${state}`)}
          </span>
          {state === "running" ? (
            <Button
              aria-label={t("browser.panel.stop")}
              className="size-7"
              disabled={busy}
              onClick={() => stop.mutate()}
              size="icon"
              variant="ghost"
            >
              <Pause aria-hidden className="size-3.5" />
            </Button>
          ) : (
            <Button
              className="h-7 text-xs"
              disabled={busy}
              onClick={() => start.mutate()}
              size="sm"
              variant="outline"
            >
              <Play aria-hidden className="mr-1 size-3" />
              {t("browser.panel.start")}
            </Button>
          )}
        </div>
      )}
      {running ? (
        <UserBrowserView
          chromeSlot={chromeSlot}
          className="min-h-0 flex-1"
          onStop={viewOwnsToolbar ? () => stop.mutate() : undefined}
          stopPending={busy}
          target={target}
        />
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          {start.isError ? (
            <p className="text-destructive">{t("browser.panel.startFailed")}</p>
          ) : null}
          <p className="text-muted-foreground">
            {state === "stopped"
              ? t("browser.panel.asleepHint")
              : t("browser.panel.hint")}
          </p>
          <ol className="list-decimal space-y-1.5 pl-4 text-muted-foreground">
            <li>{t("browser.panel.steps.start")}</li>
            <li>{t("browser.panel.steps.watch")}</li>
            <li>{t("browser.panel.steps.takeOver")}</li>
            <li>{t("browser.panel.steps.handBack")}</li>
          </ol>
          <p className="text-muted-foreground text-xs">
            {t("browser.panel.steps.unattended")}
          </p>
          <p className="text-muted-foreground text-xs">
            {t("browser.panel.steps.signOut")}
          </p>
        </div>
      )}
    </section>
  );
}
