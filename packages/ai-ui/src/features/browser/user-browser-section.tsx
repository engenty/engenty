"use client";

// The person's OWN browser on the copilot's settings pane (PLAN-user-
// browser.md §2.6): one logged-in Chromium per person, driven by Engentys
// in their name wherever they work. Start / Open (the desk's browser pane)
// / Stop / Sign out, and the two standing consents — autostart and
// unattended. Every action is keyed on the caller server-side; nobody sees
// anyone else's row here.
import { useTranslation } from "@engenty/i18n/ui";
import { Button, CardSection, Switch } from "@engenty/ui-core";
import {
  useUserBrowserGrantMutation,
  useUserBrowserGrantQuery,
  useUserBrowserMutations,
  useUserBrowserStatusQuery,
} from "./user-browser-api.js";
import { setUserBrowserPaneOpen } from "./user-browser-pane-store.js";

export function UserBrowserSection() {
  const { t } = useTranslation("ai-ui");
  const statusQuery = useUserBrowserStatusQuery(30_000);
  const grantQuery = useUserBrowserGrantQuery();
  const { signOut, start, stop } = useUserBrowserMutations();
  const grant = useUserBrowserGrantMutation();
  const state = statusQuery.data?.state ?? "absent";
  const busy =
    start.isPending || stop.isPending || signOut.isPending || grant.isPending;
  const failed = start.isError || signOut.isError || grant.isError;

  return (
    <CardSection
      cardVariant="flush"
      description={t("browser.settings.hint")}
      headerVariant="compact"
      title={t("browser.settings.title")}
      titleAction={
        <div className="flex items-center gap-1">
          {state === "running" ? (
            <>
              <Button
                className="h-8 text-xs"
                disabled={busy}
                onClick={() => setUserBrowserPaneOpen(true)}
                size="sm"
                variant="default"
              >
                {t("browser.settings.open")}
              </Button>
              <Button
                className="h-8 text-xs"
                disabled={busy}
                onClick={() => stop.mutate()}
                size="sm"
                variant="outline"
              >
                {t("browser.panel.stop")}
              </Button>
            </>
          ) : (
            <Button
              className="h-8 text-xs"
              disabled={busy}
              onClick={() => start.mutate()}
              size="sm"
              variant="outline"
            >
              {t("browser.panel.start")}
            </Button>
          )}
          {state === "absent" ? null : (
            <Button
              className="h-8 text-xs"
              disabled={busy}
              onClick={() => signOut.mutate()}
              size="sm"
              variant="ghost"
            >
              {t("browser.settings.signOut")}
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-muted-foreground text-xs">
          {t(`browser.panel.state.${state}`)}
          {signOut.isSuccess ? ` · ${t("browser.settings.signedOut")}` : ""}
        </p>
        {failed ? (
          <p className="text-destructive text-xs">
            {t("browser.settings.failed")}
          </p>
        ) : null}
        <div className="flex items-center gap-3">
          <Switch
            aria-label={t("browser.settings.autostart")}
            checked={grantQuery.data?.autostart ?? false}
            disabled={grantQuery.isLoading || grant.isPending}
            onCheckedChange={(next) => grant.mutate({ autostart: next })}
          />
          <span className="flex min-w-0 flex-col">
            <span className="text-foreground text-sm">
              {t("browser.settings.autostart")}
            </span>
            <span className="text-muted-foreground text-xs">
              {t("browser.settings.autostartHint")}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Switch
            aria-label={t("browser.settings.unattended")}
            checked={grantQuery.data?.unattended ?? false}
            disabled={grantQuery.isLoading || grant.isPending}
            onCheckedChange={(next) => grant.mutate({ unattended: next })}
          />
          <span className="flex min-w-0 flex-col">
            <span className="text-foreground text-sm">
              {t("browser.settings.unattended")}
            </span>
            <span className="text-muted-foreground text-xs">
              {t("browser.settings.unattendedHint")}
            </span>
          </span>
        </div>
      </div>
    </CardSection>
  );
}
