// Same UI as apps/ui PlatformSettingsPanel (platform scope). Secret settings
// are write-only: the server never returns their value.

import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import { Button, Input, SettingsFormSection, Switch } from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { useState } from "react";
import { toast } from "sonner";
import {
  deletePlatformSetting,
  listPlatformSettings,
  type PlatformSettingView,
  setPlatformSetting,
} from "@/lib/api/platform-settings";

const SOURCE_LABEL: Record<string, string> = {
  tenant: "Tenant override",
  platform: "Set here",
  env: "From environment",
  default: "Default",
  unset: "Not set",
};

function sourceTone(source: string): string {
  if (source === "platform") {
    return "bg-primary/10 text-primary";
  }
  if (source === "unset") {
    return "bg-muted text-muted-foreground";
  }
  return "bg-muted/60 text-muted-foreground";
}

function groupSettings(
  settings: PlatformSettingView[]
): Array<{ group: string; items: PlatformSettingView[] }> {
  const order: string[] = [];
  const byGroup = new Map<string, PlatformSettingView[]>();
  for (const s of settings) {
    if (!byGroup.has(s.group)) {
      byGroup.set(s.group, []);
      order.push(s.group);
    }
    byGroup.get(s.group)?.push(s);
  }
  return order.map((group) => ({
    group,
    items: byGroup.get(group) ?? [],
  }));
}

function obtainUrl(setting: PlatformSettingView): string | null {
  return setting.obtain.kind === "provider" && setting.obtain.url
    ? setting.obtain.url
    : null;
}

function SettingControl({
  setting,
  onChanged,
}: {
  setting: PlatformSettingView;
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState<string>(
    setting.secret ? "" : (setting.value ?? "")
  );

  const save = useMutation({
    mutationFn: (value: string) => setPlatformSetting(setting.key, value),
    onSuccess: () => {
      toast.success(`Saved ${setting.key}`);
      if (setting.secret) {
        setDraft("");
      }
      onChanged();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Failed to save"),
  });

  const clear = useMutation({
    mutationFn: () => deletePlatformSetting(setting.key),
    onSuccess: () => {
      toast.success(`Cleared ${setting.key}`);
      setDraft("");
      onChanged();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Failed to clear"),
  });

  const busy = save.isPending || clear.isPending;

  if (setting.type === "boolean") {
    const current = (setting.value ?? "false") === "true";
    return (
      <div className="flex items-center gap-3">
        <Switch
          checked={current}
          disabled={busy}
          onCheckedChange={(next) => save.mutate(next ? "true" : "false")}
        />
        {setting.isSet ? (
          <Button
            disabled={busy}
            onClick={() => clear.mutate()}
            size="sm"
            type="button"
            variant="ghost"
          >
            Reset
          </Button>
        ) : null}
      </div>
    );
  }

  const placeholder = setting.secret
    ? setting.isSet
      ? "•••••••• set — enter a new value to replace"
      : "Enter value"
    : "Enter value";
  const dirty = setting.secret
    ? draft.length > 0
    : draft !== (setting.value ?? "");

  return (
    <div className="flex items-center gap-2">
      <Input
        autoComplete="off"
        className="max-w-md font-mono text-sm"
        disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        type={setting.secret ? "password" : "text"}
        value={draft}
      />
      <Button
        disabled={busy || !dirty}
        onClick={() => save.mutate(draft)}
        size="sm"
        type="button"
      >
        {save.isPending ? (
          <AnimatedLoaderIcon play="always" size="xs" />
        ) : (
          "Save"
        )}
      </Button>
      {setting.isSet ? (
        <Button
          disabled={busy}
          onClick={() => clear.mutate()}
          size="sm"
          type="button"
          variant="ghost"
        >
          Clear
        </Button>
      ) : null}
    </div>
  );
}

export function PlatformSettingsPanel() {
  const queryClient = useQueryClient();
  const queryKey = ["manage", "platform-settings"] as const;
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => listPlatformSettings(signal),
  });

  const onChanged = () => {
    void queryClient.invalidateQueries({ queryKey });
  };

  if (query.isLoading) {
    return <p className="text-muted-foreground text-sm">Loading settings…</p>;
  }
  if (query.isError) {
    return (
      <p className="text-destructive text-sm">
        Failed to load settings. You may not have permission to view this page.
      </p>
    );
  }

  const settings = query.data?.settings ?? [];
  if (settings.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No configurable settings are available in this build.
      </p>
    );
  }

  const groups = groupSettings(settings);

  return (
    <>
      {groups.map(({ group, items }) => (
        <SettingsFormSection
          description="Applies to the whole installation. Environment variables are used as a fallback."
          key={group}
          title={group}
        >
          <div className="space-y-4">
            {items.map((setting) => (
              <div
                className="space-y-1.5 border-border/60 border-b pb-4 last:border-0 last:pb-0"
                key={setting.key}
              >
                <div className="flex items-center justify-between gap-2">
                  <code className="font-medium font-mono text-sm">
                    {setting.key}
                  </code>
                  <span
                    className={`rounded-full px-2 py-0.5 font-medium text-[11px] ${sourceTone(
                      setting.source
                    )}`}
                  >
                    {SOURCE_LABEL[setting.source] ?? setting.source}
                  </span>
                </div>
                <p className="text-muted-foreground text-xs">
                  {setting.description}
                </p>
                {obtainUrl(setting) ? (
                  <a
                    className="inline-block text-primary text-xs hover:underline"
                    href={obtainUrl(setting) ?? "#"}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Where to get this →
                  </a>
                ) : null}
                <div className="pt-1">
                  <SettingControl onChanged={onChanged} setting={setting} />
                </div>
              </div>
            ))}
          </div>
        </SettingsFormSection>
      ))}
    </>
  );
}
