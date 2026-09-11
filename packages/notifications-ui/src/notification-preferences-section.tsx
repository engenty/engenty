// Profile › Notifications: per-class channel choices and quiet hours. Reads
// and writes `core.user_settings` under `notifications.*`; the server's
// channel gate honours them at emit.
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Card,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import { useEffect, useState } from "react";
import {
  useNotificationSettingsQuery,
  useSetNotificationSettingMutation,
} from "./user-prefs.js";

const CLASSES = ["decision", "alert", "todo", "update"] as const;
const CHANNELS = ["web_push", "email"] as const;
const CHOICES = ["on", "off", "digest"] as const;

export function NotificationPreferencesSection() {
  const { t } = useTranslation("common");
  const settings = useNotificationSettingsQuery();
  const setSetting = useSetNotificationSettingMutation();
  const [quietHours, setQuietHours] = useState("");
  const [quietTz, setQuietTz] = useState("");

  useEffect(() => {
    const qh = settings.data?.get("notifications.quiet_hours");
    const tz = settings.data?.get("notifications.quiet_hours_tz");
    setQuietHours(typeof qh === "string" ? qh : "");
    setQuietTz(typeof tz === "string" ? tz : "");
  }, [settings.data]);

  const classLabel = (cls: (typeof CLASSES)[number]) =>
    ({
      alert: t("notifications.class.alert", { defaultValue: "Failures" }),
      decision: t("notifications.class.decision", {
        defaultValue: "Decisions (a run is waiting)",
      }),
      todo: t("notifications.class.todo", { defaultValue: "To-dos" }),
      update: t("notifications.class.update", { defaultValue: "Updates" }),
    })[cls];
  const channelLabel = (channel: (typeof CHANNELS)[number]) =>
    channel === "web_push"
      ? t("notifications.channel.webPush", { defaultValue: "Push" })
      : t("notifications.channel.email", { defaultValue: "Email" });

  return (
    <Card className="space-y-4 p-4">
      <div>
        <h3 className="font-semibold text-sm">
          {t("notifications.prefs.title", { defaultValue: "Notifications" })}
        </h3>
        <p className="text-muted-foreground text-xs">
          {t("notifications.prefs.subtitle", {
            defaultValue:
              "Where each kind of notification may reach you. The bell always shows everything.",
          })}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground text-xs">
              <th className="py-1 pr-3 font-medium" />
              {CHANNELS.map((channel) => (
                <th className="py-1 pr-3 font-medium" key={channel}>
                  {channelLabel(channel)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CLASSES.map((cls) => (
              <tr key={cls}>
                <td className="py-1.5 pr-3">{classLabel(cls)}</td>
                {CHANNELS.map((channel) => {
                  const name = `notifications.${cls}.${channel}`;
                  const current = settings.data?.get(name);
                  const value =
                    typeof current === "string" &&
                    CHOICES.includes(current as never)
                      ? (current as (typeof CHOICES)[number])
                      : "on";
                  return (
                    <td className="py-1.5 pr-3" key={channel}>
                      <Select
                        onValueChange={(next) =>
                          setSetting.mutate({
                            name,
                            value: next === "on" ? null : next,
                          })
                        }
                        value={value}
                      >
                        <SelectTrigger className="h-8 w-[120px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="on">
                            {t("notifications.pref.on", { defaultValue: "On" })}
                          </SelectItem>
                          <SelectItem value="off">
                            {t("notifications.pref.off", {
                              defaultValue: "Off",
                            })}
                          </SelectItem>
                          {channel === "email" ? (
                            <SelectItem value="digest">
                              {t("notifications.pref.digest", {
                                defaultValue: "Digest",
                              })}
                            </SelectItem>
                          ) : null}
                        </SelectContent>
                      </Select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label
          className="flex flex-col gap-1 text-xs"
          htmlFor="notif-quiet-hours"
        >
          {t("notifications.prefs.quietHours", { defaultValue: "Quiet hours" })}
          <Input
            className="h-8 w-[140px]"
            id="notif-quiet-hours"
            onChange={(event) => setQuietHours(event.target.value)}
            placeholder="22:00-07:00"
            value={quietHours}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs" htmlFor="notif-quiet-tz">
          {t("notifications.prefs.timeZone", { defaultValue: "Time zone" })}
          <Input
            className="h-8 w-[200px]"
            id="notif-quiet-tz"
            onChange={(event) => setQuietTz(event.target.value)}
            placeholder="Europe/Vienna"
            value={quietTz}
          />
        </label>
        <Button
          disabled={setSetting.isPending}
          onClick={() => {
            setSetting.mutate({
              name: "notifications.quiet_hours",
              value: quietHours.trim() || null,
            });
            setSetting.mutate({
              name: "notifications.quiet_hours_tz",
              value: quietTz.trim() || null,
            });
          }}
          size="sm"
          variant="outline"
        >
          {t("notifications.prefs.save", { defaultValue: "Save" })}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        {t("notifications.prefs.quietHoursHint", {
          defaultValue:
            "During quiet hours push and email wait until the window ends; the bell is unaffected.",
        })}
      </p>
    </Card>
  );
}
