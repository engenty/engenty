// Settings › Notification streams: create a stream, edit its routes. A route
// names a channel the platform has registered and the target that channel
// understands — a person for push/email, a bound messenger thread for
// `remote`. Tenant admins (`notifications.manage`) shape any stream; a space
// owner shapes the streams of their own space (the API decides per stream).
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
  uiPageScrollClassName,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  type RouteInput,
  type StreamWithRoutes,
  useCreateStreamMutation,
  useDeleteStreamMutation,
  useReplaceRoutesMutation,
  useStreamsQuery,
} from "./streams-api.js";

const CHANNELS = ["web_push", "email", "remote"] as const;
const PRIORITIES = ["low", "medium", "high", "urgent"] as const;

function routeTargetFields(channel: string): string[] {
  if (channel === "remote") {
    return ["platform", "external_thread_id"];
  }
  return ["user_id"];
}

function RoutesEditor({ stream }: { stream: StreamWithRoutes }) {
  const { t } = useTranslation("common");
  const replace = useReplaceRoutesMutation();
  const [routes, setRoutes] = useState<RouteInput[]>(
    stream.routes.map((route) => ({
      channel: route.channel,
      enabled: route.enabled,
      min_priority: route.min_priority,
      target: route.target,
    }))
  );
  const update = (index: number, patch: Partial<RouteInput>) =>
    setRoutes((current) =>
      current.map((route, i) => (i === index ? { ...route, ...patch } : route))
    );
  return (
    <div className="space-y-2">
      {routes.map((route, index) => (
        <div
          className="flex flex-wrap items-center gap-2 rounded border border-border p-2"
          key={`${stream.id}-${index}`}
        >
          <Select
            onValueChange={(channel) => update(index, { channel, target: {} })}
            value={route.channel}
          >
            <SelectTrigger className="h-8 w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHANNELS.map((channel) => (
                <SelectItem key={channel} value={channel}>
                  {channel}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {routeTargetFields(route.channel).map((field) => (
            <Input
              className="h-8 w-[200px]"
              key={field}
              onChange={(event) =>
                update(index, {
                  target: { ...route.target, [field]: event.target.value },
                })
              }
              placeholder={field}
              value={String(route.target[field] ?? "")}
            />
          ))}
          <Select
            onValueChange={(min_priority) =>
              update(index, {
                min_priority: min_priority as RouteInput["min_priority"],
              })
            }
            value={route.min_priority}
          >
            <SelectTrigger className="h-8 w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((priority) => (
                <SelectItem key={priority} value={priority}>
                  ≥ {priority}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            aria-label={t("notifications.streams.removeRoute", {
              defaultValue: "Remove route",
            })}
            onClick={() =>
              setRoutes((current) => current.filter((_, i) => i !== index))
            }
            size="icon"
            variant="ghost"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <div className="flex gap-2">
        <Button
          onClick={() =>
            setRoutes((current) => [
              ...current,
              {
                channel: "web_push",
                enabled: true,
                min_priority: "low",
                target: {},
              },
            ])
          }
          size="sm"
          variant="outline"
        >
          <Plus className="size-3.5" />
          {t("notifications.streams.addRoute", { defaultValue: "Add route" })}
        </Button>
        <Button
          disabled={replace.isPending}
          onClick={() => replace.mutate({ id: stream.id, routes })}
          size="sm"
        >
          {t("notifications.streams.saveRoutes", {
            defaultValue: "Save routes",
          })}
        </Button>
      </div>
    </div>
  );
}

export function NotificationStreamsSettingsPage() {
  const { t } = useTranslation("common");
  const streams = useStreamsQuery();
  const create = useCreateStreamMutation();
  const remove = useDeleteStreamMutation();
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const title = t("notifications.streams.title", {
    defaultValue: "Notification streams",
  });

  usePageConfig({
    breadcrumbs: [{ label: title }],
    contentStackBackground: "paper",
  });

  return (
    <div className={uiPageScrollClassName}>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-page pt-10 pb-10">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">{title}</h1>
          <p className="text-muted-foreground text-sm">
            {t("notifications.streams.subtitle", {
              defaultValue:
                "Named queues an Engenty can raise things into — a leads queue, support escalations — with routes out to push, email or a bound messenger thread.",
            })}
          </p>
        </div>
        <Card className="flex flex-wrap items-end gap-2 p-4">
          <label className="flex flex-col gap-1 text-xs" htmlFor="stream-key">
            {t("notifications.streams.key", { defaultValue: "Key" })}
            <Input
              className="h-8 w-[220px]"
              id="stream-key"
              onChange={(event) => setKey(event.target.value)}
              placeholder="support-escalations"
              value={key}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs" htmlFor="stream-name">
            {t("notifications.streams.name", { defaultValue: "Name" })}
            <Input
              className="h-8 w-[260px]"
              id="stream-name"
              onChange={(event) => setName(event.target.value)}
              placeholder="Support escalations"
              value={name}
            />
          </label>
          <Button
            disabled={create.isPending || !(key.trim() && name.trim())}
            onClick={() =>
              create.mutate(
                { key: key.trim(), name: name.trim() },
                {
                  onSuccess: () => {
                    setKey("");
                    setName("");
                  },
                }
              )
            }
            size="sm"
          >
            <Plus className="size-3.5" />
            {t("notifications.streams.create", {
              defaultValue: "Create stream",
            })}
          </Button>
          {create.isError ? (
            <p className="w-full text-destructive text-xs">
              {create.error instanceof Error ? create.error.message : "failed"}
            </p>
          ) : null}
        </Card>
        {(streams.data?.streams ?? []).map((stream) => (
          <Card className="space-y-3 p-4" key={stream.id}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold text-sm">{stream.name}</h2>
                <p className="text-muted-foreground text-xs">
                  <code>{stream.key}</code>
                  {stream.space_id
                    ? ` · ${t("notifications.streams.spaceScoped", { defaultValue: "space-scoped" })}`
                    : ` · ${t("notifications.streams.tenantWide", { defaultValue: "tenant-wide" })}`}
                </p>
              </div>
              <Button
                aria-label={t("notifications.streams.delete", {
                  defaultValue: "Delete stream",
                })}
                disabled={remove.isPending}
                onClick={() => remove.mutate(stream.id)}
                size="icon"
                variant="ghost"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            <RoutesEditor stream={stream} />
          </Card>
        ))}
        {streams.data && streams.data.streams.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("notifications.streams.empty", {
              defaultValue: "No streams yet.",
            })}
          </p>
        ) : null}
      </div>
    </div>
  );
}
