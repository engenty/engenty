import { useSettingsSecondaryShellNav } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { Button, Card, Label, Switch } from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { Save } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type FeatureFlagDefinition,
  getFeatureFlagsManage,
  setFeatureFlagsOverrides,
} from "@/lib/api/client";
import { collectModuleNamespacesFromI18nKeys } from "@/lib/collect-module-namespaces-from-i18n-keys";

export function FeatureFlagsPage() {
  const { t, i18n } = useTranslation("common");
  const { moduleRootCrumb, secondaryNavHeaderSlot } =
    useSettingsSecondaryShellNav(t("navigation.settings"));
  const [loading, setLoading] = useState(true);
  const [flagI18nReady, setFlagI18nReady] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [definitions, setDefinitions] = useState<FeatureFlagDefinition[]>([]);
  const [resolved, setResolved] = useState<Record<string, boolean>>({});
  const [localOverrides, setLocalOverrides] = useState<Record<string, boolean>>(
    {}
  );
  const [tenantId, setTenantId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getFeatureFlagsManage(null);
      setDefinitions(data.definitions);
      setResolved(data.resolved);
      setLocalOverrides(data.tenant);
      setTenantId(data.tenantId);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load feature flags"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggle = useCallback((key: string, value: boolean) => {
    setLocalOverrides((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    try {
      const updates = definitions.map((def) => {
        const effective =
          localOverrides[def.key] ?? resolved[def.key] ?? def.default;
        return { key: def.key, tenant_id: tenantId, enabled: effective };
      });
      await setFeatureFlagsOverrides(updates);
      setMessage({ type: "success", text: t("featureFlags.saved") });
      load();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : t("featureFlags.saveFailed"),
      });
    } finally {
      setSaving(false);
    }
  }, [definitions, localOverrides, resolved, tenantId, load, t]);

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;
  const stableHandleSave = useCallback(() => handleSaveRef.current(), []);

  const pageActions = useMemo(() => {
    if (
      loading ||
      definitions.length === 0 ||
      (definitions.length > 0 && !flagI18nReady)
    ) {
      return null;
    }
    return (
      <Button
        className="h-8 gap-1.5 px-2.5 text-xs"
        disabled={saving}
        onClick={stableHandleSave}
        size="sm"
      >
        {saving ? (
          <AnimatedLoaderIcon play="always" size="xs" />
        ) : (
          <Save className="h-3.5 w-3.5" />
        )}
        {saving ? t("featureFlags.saving") : t("featureFlags.save")}
      </Button>
    );
  }, [loading, saving, stableHandleSave, definitions.length, flagI18nReady, t]);

  usePageConfig({
    breadcrumbs: useMemo(
      () => [
        ...(moduleRootCrumb ? [moduleRootCrumb] : []),
        { label: t("featureFlags.title") },
      ],
      [moduleRootCrumb, t]
    ),
    actions: pageActions,
    secondaryNavHeaderSlot,
  });

  const grouped = useMemo(() => {
    const map = new Map<string, FeatureFlagDefinition[]>();
    for (const def of definitions) {
      const ns = def.namespace.trim() || "general";
      const list = map.get(ns) ?? [];
      list.push(def);
      map.set(ns, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [definitions]);

  const { flagTranslationNamespaces, flagTranslationNsKey } = useMemo(() => {
    const keys: string[] = [];
    for (const def of definitions) {
      if (def.labelKey) {
        keys.push(def.labelKey);
      }
      if (def.descriptionKey) {
        keys.push(def.descriptionKey);
      }
    }
    const flagTranslationNamespaces = collectModuleNamespacesFromI18nKeys(keys);
    return {
      flagTranslationNamespaces,
      flagTranslationNsKey: flagTranslationNamespaces.join("|"),
    };
  }, [definitions]);

  useLayoutEffect(() => {
    if (flagTranslationNsKey.length === 0) {
      setFlagI18nReady(true);
      return;
    }
    setFlagI18nReady(false);
  }, [flagTranslationNsKey]);

  useEffect(() => {
    if (flagTranslationNamespaces.length === 0) {
      return;
    }
    let cancelled = false;
    void i18n.loadNamespaces(flagTranslationNamespaces).finally(() => {
      if (!cancelled) {
        setFlagI18nReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [i18n, flagTranslationNsKey, flagTranslationNamespaces]);

  if (loading || (definitions.length > 0 && !flagI18nReady)) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto">
        <div className="container mx-auto p-page">
          <p className="text-muted-foreground text-sm">
            {t("featureFlags.loading")}
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto">
        <div className="container mx-auto p-page">
          <p className="text-destructive text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto">
      <div className="container mx-auto max-w-4xl space-y-6 p-page">
        <div>
          <h1 className="font-semibold text-xl">{t("featureFlags.title")}</h1>
          <p className="text-muted-foreground text-sm">
            {t("featureFlags.description")}
          </p>
        </div>

        {message && (
          <p
            className={`text-sm ${message.type === "success" ? "text-green-600 dark:text-green-400" : "text-destructive"}`}
          >
            {message.text}
          </p>
        )}

        {grouped.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("featureFlags.noFlags")}
          </p>
        ) : (
          <div className="space-y-8">
            {grouped.map(([namespace, defs]) => (
              <div className="space-y-3" key={namespace}>
                <h2 className="font-semibold text-base capitalize">
                  {namespace}
                </h2>
                <Card className="overflow-hidden rounded-lg border">
                  {defs.map((def, idx) => {
                    const effective =
                      localOverrides[def.key] ??
                      resolved[def.key] ??
                      def.default;
                    const label = def.labelKey ? t(def.labelKey) : def.key;
                    const desc = def.descriptionKey
                      ? t(def.descriptionKey)
                      : "";
                    return (
                      <div key={def.key}>
                        {idx > 0 && <div className="mx-4 border-b" />}
                        <div className="flex items-center justify-between p-4">
                          <div className="flex-1">
                            <Label className="font-semibold text-base">
                              {label}
                            </Label>
                            {desc && (
                              <p className="text-muted-foreground text-sm">
                                {desc}
                              </p>
                            )}
                          </div>
                          <Switch
                            checked={effective}
                            onCheckedChange={(v) => handleToggle(def.key, v)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </Card>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
