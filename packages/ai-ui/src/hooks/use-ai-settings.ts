import { useCallback, useEffect, useMemo, useState } from "react";
import type { AiConfig } from "../lib/admin/ai-settings-api";
import {
  useAiSettingsQuery,
  useSaveAiSettingsMutation,
} from "../lib/admin/ai-settings-queries";

/** Tenant-pinnable model fields. Null on any of them means "inherit". */
const MODEL_FIELDS = [
  "chat_model_id",
  "classifier_model_id",
  "fast_text_model_id",
] as const;

/** Everything inherits: the "reset to defaults" target now clears pins. */
const INHERIT_CONFIG: AiConfig = {
  chat_model_id: null,
  classifier_model_id: null,
  fast_text_model_id: null,
  doc_converter: null,
  realtime_voice: null,
  caps: null,
  agent_approval: null,
  generated_starters: null,
  timezone: null,
};

const EMPTY_CONFIG: AiConfig = { ...INHERIT_CONFIG };

function normalizeDocConverter(
  dc: AiConfig["doc_converter"]
): NonNullable<AiConfig["doc_converter"]> {
  return {
    provider:
      dc?.provider === "llamaparse" ||
      dc?.provider === "gemini" ||
      dc?.provider === "liteparse" ||
      dc?.provider === "mistral"
        ? dc.provider
        : "local",
    browser_parse:
      dc?.browser_parse === "off" ||
      dc?.browser_parse === "anydoc" ||
      dc?.browser_parse === "liteparse"
        ? dc.browser_parse
        : "anydoc",
    gemini_model:
      typeof dc?.gemini_model === "string" && dc.gemini_model.trim()
        ? dc.gemini_model.trim()
        : null,
    mistral_model:
      typeof dc?.mistral_model === "string" && dc.mistral_model.trim()
        ? dc.mistral_model.trim()
        : null,
  };
}

function docConverterSignature(dc: AiConfig["doc_converter"]): string {
  const n = normalizeDocConverter(dc);
  return `${n.provider}|${n.browser_parse}|${n.gemini_model ?? ""}|${n.mistral_model ?? ""}`;
}

function capsSignature(caps: AiConfig["caps"]): string {
  const steps = caps?.max_steps;
  return typeof steps === "number" && steps > 0
    ? String(Math.floor(steps))
    : "";
}

function realtimeVoiceSignature(rv: AiConfig["realtime_voice"]): string {
  if (!rv) {
    return "";
  }
  return [
    rv.provider ?? "",
    rv.openai_model ?? "",
    rv.openai_transcription_model ?? "",
    rv.openai_voice ?? "",
    rv.voxtral_stt_model ?? rv.mistral_stt_model ?? "",
    rv.elevenlabs_tts_model ?? rv.mistral_tts_model ?? "",
    rv.elevenlabs_voice_id ?? "",
    rv.voice_register ?? "",
  ].join("|");
}

function modelField(config: AiConfig, key: (typeof MODEL_FIELDS)[number]) {
  return config[key]?.trim() || null;
}

function agentApprovalSignature(prefs: AiConfig["agent_approval"]): string {
  const mode = prefs?.mode ?? "";
  const agents = prefs?.agents
    ? Object.entries(prefs.agents)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${key}:${value}`)
        .join(",")
    : "";
  return `${mode}|${agents}`;
}

function normalizeConfig(config: AiConfig): AiConfig {
  const out: AiConfig = {
    doc_converter: config.doc_converter ?? null,
    realtime_voice: config.realtime_voice ?? null,
    caps: config.caps ?? null,
    agent_approval: config.agent_approval ?? null,
    generated_starters: config.generated_starters === true ? true : null,
    timezone: config.timezone?.trim() || null,
  };
  for (const key of MODEL_FIELDS) {
    out[key] = modelField(config, key);
  }
  return out;
}

function configSignature(config: AiConfig): string {
  const models = MODEL_FIELDS.map((k) => modelField(config, k) ?? "").join("|");
  return `${models}::${docConverterSignature(config.doc_converter)}::${capsSignature(config.caps)}::${realtimeVoiceSignature(config.realtime_voice)}::${agentApprovalSignature(config.agent_approval)}::${config.generated_starters === true ? "1" : "0"}::${config.timezone?.trim() || ""}`;
}

export function useAiSettings() {
  const query = useAiSettingsQuery();
  const saveMutation = useSaveAiSettingsMutation();

  const serverConfig = query.data;
  const lastSaved = useMemo(
    () => (serverConfig ? normalizeConfig(serverConfig) : EMPTY_CONFIG),
    [serverConfig]
  );

  const [settings, setSettings] = useState<AiConfig>(EMPTY_CONFIG);

  // Sync from server on initial load (prev empty) or when the current state
  // still matches the server (e.g. after save + refetch).
  useEffect(() => {
    if (!serverConfig) {
      return;
    }
    const merged = normalizeConfig(serverConfig);
    setSettings((prev) => {
      const prevEmpty = configSignature(prev) === configSignature(EMPTY_CONFIG);
      const matchesServer = configSignature(prev) === configSignature(merged);
      return prevEmpty || matchesServer ? merged : prev;
    });
  }, [serverConfig]);

  const hasChanges = useMemo(
    () => configSignature(settings) !== configSignature(lastSaved),
    [settings, lastSaved]
  );

  const handleReset = useCallback(() => {
    setSettings({ ...lastSaved });
  }, [lastSaved]);

  const handleResetToDefaults = useCallback(() => {
    setSettings({ ...INHERIT_CONFIG });
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
