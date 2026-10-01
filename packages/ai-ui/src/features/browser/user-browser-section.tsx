"use client";

// The Space's browser on an agent's settings pane (PLAN-user-browser.md
// §2.6; PLAN-space-owned-connections.md): one logged-in Chromium per Space,
// shared by its agents, each in its own window. Start / Open (the desk's
// browser pane) / Stop / Sign out, and the Space's two standing consents —
// autostart and unattended — which only its owners may change (the server
// enforces that).
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  CardSection,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@engenty/ui-core";
import type { BrowserTarget } from "./browser-target.js";
import {
  useUserBrowserGrantMutation,
  useUserBrowserGrantQuery,
  useUserBrowserMutations,
  useUserBrowserStatusQuery,
} from "./user-browser-api.js";
import { setUserBrowserPaneOpen } from "./user-browser-pane-store.js";

/** The memory caps a tenant admin may pick; the server clamps to its own maximum. */
const MEMORY_CHOICES_MB = [1024, 2048, 4096, 8192] as const;

/**
 * The Space's two standing consents. `compact` shortens the labels and
 * moves the hints into a tooltip, for the
 * agent's screen placeholder; the settings carry the full text.
 */
export function UserBrowserConsents({
  compact = false,
  target,
}: {
  compact?: boolean;
  target: Pick<BrowserTarget, "spaceId">;
}) {
  const { t } = useTranslation("ai-ui");
  const grantQuery = useUserBrowserGrantQuery(target);
  const grant = useUserBrowserGrantMutation(target);
  const rows = [
    [
      "autostart",
      "browser.settings.autostart",
      "browser.settings.autostartHint",
      "browser.settings.autostartShort",
    ],
    [
      "unattended",
      "browser.settings.unattended",
      "browser.settings.unattendedHint",
      "browser.settings.unattendedShort",
    ],
  ] as const;

  return (
    <div
      className={
        compact
          ? "flex flex-wrap justify-center gap-x-5 gap-y-1"
          : "flex flex-col gap-3"
      }
    >
      {rows.map(([key, label, hint, short]) => (
        <div
          className={
            compact
              ? "flex items-center gap-2 text-left"
              : "flex items-center gap-3"
          }
          key={key}
          title={compact ? t(hint) : undefined}
        >
          <Switch
            aria-label={t(label)}
            checked={grantQuery.data?.[key] ?? false}
            className={compact ? "scale-90" : undefined}
            disabled={grantQuery.isLoading || grant.isPending}
            onCheckedChange={(next) => grant.mutate({ [key]: next })}
          />
          <span className="flex min-w-0 flex-col">
            <span
              className={
                compact
                  ? "text-muted-foreground text-xs"
                  : "text-foreground text-sm"
              }
            >
              {t(compact ? short : label)}
            </span>
            {compact ? null : (
              <span className="text-muted-foreground text-xs">{t(hint)}</span>
            )}
          </span>
        </div>
      ))}
      {!compact && grantQuery.data?.memory_editable ? (
        <div className="flex flex-col gap-1">
          <span className="text-foreground text-sm">
            {t("browser.settings.memory")}
          </span>
          <Select
            disabled={grantQuery.isLoading || grant.isPending}
            onValueChange={(next) =>
              grant.mutate({
                memory_mb: next === "default" ? null : Number(next),
              })
            }
            value={String(grantQuery.data.memory_mb ?? "default")}
          >
            <SelectTrigger aria-label={t("browser.settings.memory")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">
                {t("browser.settings.memoryDefault")}
              </SelectItem>
              {MEMORY_CHOICES_MB.map((mb) => (
                <SelectItem key={mb} value={String(mb)}>
                  {mb / 1024} GB
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground text-xs">
            {t("browser.settings.memoryHint")}
          </span>
        </div>
      ) : null}
      {grant.isError ? (
        <p className="text-destructive text-xs">
          {t("browser.settings.failed")}
        </p>
      ) : null}
    </div>
  );
}

export function UserBrowserSection({
  target,
}: {
  target: Pick<BrowserTarget, "spaceId">;
}) {
  const { t } = useTranslation("ai-ui");
  const statusQuery = useUserBrowserStatusQuery(target, 30_000);
  const { restart, signOut, start, stop } = useUserBrowserMutations(target);
  const state = statusQuery.data?.state ?? "absent";
  const busy =
    start.isPending || stop.isPending || restart.isPending || signOut.isPending;
  const failed = start.isError || restart.isError || signOut.isError;

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
              <Button
                className="h-8 text-xs"
                disabled={busy}
                onClick={() => restart.mutate()}
                size="sm"
                variant="outline"
              >
                {t("browser.panel.restart")}
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
      <div className="flex flex-col gap-3 px-4 py-3">
        <p className="text-muted-foreground text-xs">
          {t(`browser.panel.state.${state}`)}
          {signOut.isSuccess ? ` · ${t("browser.settings.signedOut")}` : ""}
        </p>
        {failed ? (
          <p className="text-destructive text-xs">
            {t("browser.settings.failed")}
          </p>
        ) : null}
        <UserBrowserConsents target={target} />
      </div>
    </CardSection>
  );
}
