// Renders the configurable env manifest as editable settings, grouped by the
// manifest's group. Platform scope = superadmin installation-wide config;
// tenant scope = per-tenant credential overrides. Secret settings are
// write-only: the server never returns their value, so the input starts empty
// and only reports whether a value is set and where it currently resolves from.

import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import { Button, Input, SettingsFormSection, Switch } from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  type DeploymentEnvVar,
  deletePlatformSetting,
  deleteTenantSettingOverride,
  listPlatformSettings,
  listTenantSettingOverrides,
  type PlatformSettingsContext,
  type PlatformSettingView,
  setPlatformSetting,
  setTenantSettingOverride,
} from "@/lib/api/client";

type Scope = "platform" | "tenant";

const scopeApi = {
  platform: {
    list: listPlatformSettings,
    set: setPlatformSetting,
    remove: deletePlatformSetting,
  },
  tenant: {
    list: listTenantSettingOverrides,
    set: setTenantSettingOverride,
    remove: deleteTenantSettingOverride,
  },
} as const;

const SOURCE_LABEL: Record<string, string> = {
  tenant: "Tenant override",
  platform: "Set here",
  env: "From environment",
  default: "Default",
  unset: "Not set",
};

function sourceTone(source: string, scope: Scope): string {
  if (source === scope || (scope === "platform" && source === "platform")) {
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

function groupDeploymentEnv(
  vars: DeploymentEnvVar[]
): Map<string, DeploymentEnvVar[]> {
  const byGroup = new Map<string, DeploymentEnvVar[]>();
  for (const envVar of vars) {
    const bucket = byGroup.get(envVar.group);
    if (bucket) {
      bucket.push(envVar);
    } else {
      byGroup.set(envVar.group, [envVar]);
    }
  }
  return byGroup;
}

function obtainUrl(setting: PlatformSettingView): string | null {
  return setting.obtain.kind === "provider" && setting.obtain.url
    ? setting.obtain.url
    : null;
}

/** A group needs the callback callout when its steps talk about a redirect URI. */
function groupUsesRedirectUri(items: PlatformSettingView[]): boolean {
  return items.some((s) =>
    s.obtain.instructions?.some((line) => /redirect|callback/i.test(line))
  );
}

/**
 * Read-only status for a key only the deployment environment can supply —
 * the value is never sent to the browser, just whether it is present.
 */
function DeploymentEnvRows({ vars }: { vars: DeploymentEnvVar[] }) {
  if (vars.length === 0) {
    return null;
  }
  return (
    <div className="space-y-3 rounded-md border border-dashed bg-muted/30 p-3">
      <p className="text-muted-foreground text-xs">
        Set in the deployment environment (Coolify env vars,{" "}
        <code className="font-mono">deploy/.env</code>) and read at boot — not
        editable here. Restart the services after changing one.
      </p>
      {vars.map((envVar) => (
        <div className="space-y-1" key={envVar.key}>
          <div className="flex items-center justify-between gap-2">
            <code className="font-medium font-mono text-sm">{envVar.key}</code>
            <span
              className={`rounded-full px-2 py-0.5 font-medium text-[11px] ${
                envVar.isSet
                  ? "bg-muted/60 text-muted-foreground"
                  : envVar.required === "optional"
                    ? "bg-muted text-muted-foreground"
                    : "bg-destructive/10 text-destructive"
              }`}
            >
              {envVar.isSet ? "Set" : "Not set"}
            </span>
          </div>
          <p className="text-muted-foreground text-xs">{envVar.description}</p>
        </div>
      ))}
    </div>
  );
}

function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 break-all rounded bg-background/80 px-2 py-1 font-mono text-xs">
        {value}
      </code>
      <Button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            toast.error("Could not copy — select the text instead");
          }
        }}
        size="sm"
        type="button"
        variant="outline"
      >
        {copied ? (
          <Check className="size-3.5" />
        ) : (
          <Copy className="size-3.5" />
        )}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

/**
 * Every OAuth connector shares one callback route, so the URL to register in
 * the provider console (Google, Microsoft, Slack, …) is the same for all of
 * them — show it once per group, ready to paste.
 */
function RedirectUriCallout({
  context,
}: {
  context: PlatformSettingsContext | undefined;
}) {
  if (!context?.oauthRedirectUri) {
    return (
      <div className="rounded-md border border-dashed bg-muted/40 p-3 text-muted-foreground text-xs">
        Set <code className="font-mono">PUBLIC_APP_URL</code> (or{" "}
        <code className="font-mono">ENGENTY_API_BASE_URL</code>) so this
        installation can tell you the exact OAuth redirect URI to register.
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-md border bg-muted/40 p-3">
      <p className="font-medium text-xs">
        Authorized redirect URI — paste this into the provider&apos;s OAuth app
      </p>
      <CopyValue value={context.oauthRedirectUri} />
      <p className="text-muted-foreground text-xs">
        Register this exact URL (no trailing slash, no extra path). Every
        connector shares it — it is the only redirect URI engenty ever uses. The
        app origin alone (for example{" "}
        <code className="font-mono">{context.apiBaseUrl || "https://…"}</code>)
        is not a valid redirect URI, though Google also wants that origin under
        &quot;Authorized JavaScript origins&quot;.
      </p>
      {context.redirectHostRejected ? (
        <div className="space-y-2 border-border/60 border-t pt-2">
          <p className="text-muted-foreground text-xs">
            <span className="font-medium text-foreground">
              Local development:
            </span>{" "}
            providers reject <code className="font-mono">*.localhost</code>{" "}
            hosts — only <code className="font-mono">localhost</code> and{" "}
            <code className="font-mono">127.0.0.1</code> with a port are
            accepted. Register the loopback URL below instead and set{" "}
            <code className="font-mono">CONNECTIONS_REDIRECT_URI</code> to it,
            so the flow sends exactly what the provider has on file.
          </p>
          {context.loopbackRedirectUri ? (
            <CopyValue value={context.loopbackRedirectUri} />
          ) : (
            <p className="text-muted-foreground text-xs">
              Set <code className="font-mono">ENGENTY_CORE_BASE_URL</code> to
              see the loopback URL for this checkout.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function SettingControl({
  scope,
  setting,
  onChanged,
}: {
  scope: Scope;
  setting: PlatformSettingView;
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState<string>(
    setting.secret ? "" : (setting.value ?? "")
  );

  const save = useMutation({
    mutationFn: (value: string) => scopeApi[scope].set(setting.key, value),
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
    mutationFn: () => scopeApi[scope].remove(setting.key),
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

export function PlatformSettingsPanel({ scope }: { scope: Scope }) {
  const queryClient = useQueryClient();
  const queryKey = ["platform-settings", scope] as const;
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => scopeApi[scope].list(signal),
  });

  const onChanged = () => queryClient.invalidateQueries({ queryKey });

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
        {scope === "tenant"
          ? "No integration keys can be overridden for your tenant."
          : "No configurable settings are available in this build."}
      </p>
    );
  }

  const groups = groupSettings(settings);
  const context = query.data?.context;
  const deployByGroup = groupDeploymentEnv(query.data?.deploymentEnv ?? []);
  const deployOnlyGroups = [...deployByGroup.entries()].filter(
    ([group]) => !groups.some((g) => g.group === group)
  );

  return (
    <>
      {groups.map(({ group, items }) => (
        <SettingsFormSection
          description={
            scope === "tenant"
              ? "Override the platform default for your tenant. Leave blank to inherit."
              : "Applies to the whole installation. Environment variables are used as a fallback."
          }
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
                      setting.source,
                      scope
                    )}`}
                  >
                    {SOURCE_LABEL[setting.source] ?? setting.source}
                  </span>
                </div>
                <p className="text-muted-foreground text-xs">
                  {setting.description}
                </p>
                {setting.obtain.instructions?.length ? (
                  <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground text-xs">
                    {setting.obtain.instructions.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ul>
                ) : null}
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
                  <SettingControl
                    onChanged={onChanged}
                    scope={scope}
                    setting={setting}
                  />
                </div>
              </div>
            ))}
            {groupUsesRedirectUri(items) ? (
              <RedirectUriCallout context={context} />
            ) : null}
            <DeploymentEnvRows vars={deployByGroup.get(group) ?? []} />
          </div>
        </SettingsFormSection>
      ))}
      {deployOnlyGroups.map(([group, vars]) => (
        <SettingsFormSection
          description="Read from the deployment environment at boot — shown here so a missing key surfaces before it breaks a flow."
          key={group}
          title={group}
        >
          <DeploymentEnvRows vars={vars} />
        </SettingsFormSection>
      ))}
    </>
  );
}
