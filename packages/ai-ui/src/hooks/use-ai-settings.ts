import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type AiConfig,
  DEFAULT_CHAT_MODEL,
  DEFAULT_CLASSIFIER_MODEL,
  DEFAULT_COORDINATOR_MODEL,
} from "../lib/admin/ai-settings-api";
import {
  useAiSettingsQuery,
  useSaveAiSettingsMutation,
} from "../lib/admin/ai-settings-queries";

const CODE_DEFAULTS: AiConfig = {
  chat_model_id: DEFAULT_CHAT_MODEL,
  coordinator_model_id: DEFAULT_COORDINATOR_MODEL,
  classifier_model_id: DEFAULT_CLASSIFIER_MODEL,
  doc_converter: {
    provider: "local",
    gemini_model: null,
  },
};

const EMPTY_CONFIG: AiConfig = {
  chat_model_id: null,
  coordinator_model_id: null,
  classifier_model_id: null,
  doc_converter: null,
};

function normalizeDocConverter(
  dc: AiConfig["doc_converter"]
): NonNullable<AiConfig["doc_converter"]> {
  return {
    provider:
      dc?.provider === "llamaparse" ||
      dc?.provider === "gemini" ||
      dc?.provider === "liteparse"
        ? dc.provider
        : "local",
    gemini_model:
      typeof dc?.gemini_model === "string" && dc.gemini_model.trim()
        ? dc.gemini_model.trim()
        : null,
  };
}

function docConverterSignature(dc: AiConfig["doc_converter"]): string {
  const n = normalizeDocConverter(dc);
  return `${n.provider}|${n.gemini_model ?? ""}`;
}

function mergeWithDefaults(config: AiConfig): AiConfig {
  return {
    chat_model_id: config.chat_model_id ?? CODE_DEFAULTS.chat_model_id ?? null,
    coordinator_model_id:
      config.coordinator_model_id ?? CODE_DEFAULTS.coordinator_model_id ?? null,
    classifier_model_id:
      config.classifier_model_id ?? CODE_DEFAULTS.classifier_model_id ?? null,
    doc_converter: normalizeDocConverter(config.doc_converter),
  };
}

export function useAiSettings() {
  const query = useAiSettingsQuery();
  const saveMutation = useSaveAiSettingsMutation();

  const serverConfig = query.data;
  const lastSaved = useMemo(
    () => (serverConfig ? mergeWithDefaults(serverConfig) : EMPTY_CONFIG),
    [serverConfig]
  );

  const [settings, setSettings] = useState<AiConfig>(EMPTY_CONFIG);

  // Sync from server on initial load (prev empty) or when current state matches server (e.g. after save + refetch).
  useEffect(() => {
    if (!serverConfig) {
      return;
    }
    const merged = mergeWithDefaults(serverConfig);
    setSettings((prev) => {
      const prevEmpty =
        prev.chat_model_id == null &&
        prev.coordinator_model_id == null &&
        prev.classifier_model_id == null &&
        prev.doc_converter == null;
      const matchesServer =
        (prev.chat_model_id ?? "") === (merged.chat_model_id ?? "") &&
        (prev.coordinator_model_id ?? "") ===
          (merged.coordinator_model_id ?? "") &&
        (prev.classifier_model_id ?? "") ===
          (merged.classifier_model_id ?? "") &&
        docConverterSignature(prev.doc_converter) ===
          docConverterSignature(merged.doc_converter);
      return prevEmpty || matchesServer ? merged : prev;
    });
  }, [serverConfig]);

  const hasChanges = useMemo(
    () =>
      (settings.chat_model_id ?? "") !== (lastSaved.chat_model_id ?? "") ||
      (settings.coordinator_model_id ?? "") !==
        (lastSaved.coordinator_model_id ?? "") ||
      (settings.classifier_model_id ?? "") !==
        (lastSaved.classifier_model_id ?? "") ||
      docConverterSignature(settings.doc_converter) !==
        docConverterSignature(lastSaved.doc_converter),
    [settings, lastSaved]
  );

  const handleReset = useCallback(() => {
    setSettings({ ...lastSaved });
  }, [lastSaved]);

  const handleResetToDefaults = useCallback(() => {
    setSettings({ ...CODE_DEFAULTS });
  }, []);

  const handleSave = useCallback(async () => {
    await saveMutation.mutateAsync(settings);
  }, [settings, saveMutation]);

  const updateSettings = useCallback(
    <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  return {
    handleReset,
    handleResetToDefaults,
    handleSave,
    hasChanges,
    lastSaved,
    loading: query.isLoading,
    saveError: saveMutation.error
      ? saveMutation.error instanceof Error
        ? saveMutation.error.message
        : String(saveMutation.error)
      : null,
    saving: saveMutation.isPending,
    settings,
    updateSettings,
  };
}
