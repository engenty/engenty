"use client";

// The agent's "computer" on its pane: a live thumbnail of its window in the
// Space's browser. Clicking it opens the browser pane, where the person
// watches full size and takes over. With no browser running it offers Start
// and the Space's two browser consents.
import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { Monitor, Play } from "lucide-react";
import type { BrowserTarget } from "./browser-target.js";
import {
  useUserBrowserMutations,
  useUserBrowserStatusQuery,
} from "./user-browser-api.js";
import { setUserBrowserPaneOpen } from "./user-browser-pane-store.js";
import { UserBrowserConsents } from "./user-browser-section.js";
import { UserBrowserView } from "./user-browser-view.js";

export function AgentScreenPreview({
  agentName,
  onOpen,
  target,
}: {
  agentName: string;
  /** The pane this preview sits in closes: the browser takes its place. */
  onOpen: () => void;
  target: BrowserTarget;
}) {
  const { t } = useTranslation("ai-ui");
  const status = useUserBrowserStatusQuery(target, 30_000);
  const { start } = useUserBrowserMutations(target);
  const state = status.data?.state ?? "absent";
  const running = state === "running";

  return (
    <figure className="m-0 space-y-2">
      {running ? (
        <button
          aria-label={t("browser.screen.open")}
          className="block aspect-video w-full overflow-hidden rounded-lg bg-black transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => {
            onOpen();
            setUserBrowserPaneOpen(true);
          }}
          type="button"
        >
          <UserBrowserView className="size-full" preview target={target} />
        </button>
      ) : (
        <div className="relative flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-lg bg-muted/60 px-4 pb-10 text-center">
          <Monitor aria-hidden className="size-6 text-muted-foreground" />
          <p className="max-w-sm text-muted-foreground text-xs">
            {state === "stopped"
              ? t("browser.panel.asleepHint")
              : t("browser.screen.absentHint")}
          </p>
          {start.isError ? (
            <p className="text-destructive text-xs">
              {t("browser.panel.startFailed")}
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            <Button
              className="h-8 text-xs"
              disabled={start.isPending || status.isPending}
              onClick={() => start.mutate()}
              size="sm"
            >
              <Play aria-hidden className="mr-1 size-3 fill-current" />
              {t("browser.panel.start")}
            </Button>
          </div>
          <div className="absolute inset-x-0 bottom-3 px-4">
            <UserBrowserConsents compact target={target} />
          </div>
        </div>
      )}
      <figcaption className="text-center text-muted-foreground text-xs">
        {t("browser.screen.caption", { name: agentName })}
      </figcaption>
    </figure>
  );
}
