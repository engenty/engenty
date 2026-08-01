import type { RealtimeVoiceTenantPrefs } from "@engenty/ai-core/browser";
import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsFormSection,
} from "@engenty/ui-core";
import type { AiConfig } from "../../lib/admin/ai-settings-api";
import { useRealtimeVoiceOptionsQuery } from "../../lib/admin/ai-settings-queries";
import type { RealtimeVoiceOption } from "../../lib/admin/realtime-voice-options-api";

interface RealtimeVoiceSettingsCardProps {
  settings: AiConfig;
  t: (key: string) => string;
  updateSettings: <K extends keyof AiConfig>(
    key: K,
    value: AiConfig[K]
  ) => void;
}

const VOICE_REGISTERS = ["de-AT", "de-DE", "de-CH"] as const;
const DEFAULT_OPTION_VALUE = "__default__";

export function RealtimeVoiceSettingsCard({
  settings,
  t,
  updateSettings,
}: RealtimeVoiceSettingsCardProps) {
  const voice: RealtimeVoiceTenantPrefs = settings.realtime_voice ?? {};
  const provider =
    voice.provider === "voxtral-elevenlabs" || voice.provider === "mistral"
      ? "voxtral-elevenlabs"
      : "openai";
  const update = (patch: Partial<RealtimeVoiceTenantPrefs>) =>
    updateSettings("realtime_voice", { ...voice, ...patch });
  const optionsQuery = useRealtimeVoiceOptionsQuery();
  const options = optionsQuery.data;

  return (
    <SettingsFormSection
      description={t("realtimeVoice.description")}
      title={t("realtimeVoice.title")}
    >
      <VoiceSelectField
        id="realtime-voice-provider"
        label={t("realtimeVoice.providerLabel")}
        onChange={(value) =>
          update({
            provider:
              value === "voxtral-elevenlabs" ? "voxtral-elevenlabs" : "openai",
          })
        }
        options={[
          { label: t("realtimeVoice.providerOpenAi"), value: "openai" },
          {
            label: t("realtimeVoice.providerVoxtralElevenLabs"),
            value: "voxtral-elevenlabs",
          },
        ]}
        placeholder={t("realtimeVoice.providerPlaceholder")}
        value={provider}
      />
      <p className="text-muted-foreground text-xs">
        {provider === "voxtral-elevenlabs"
          ? t("realtimeVoice.cascadePipelineHelp")
          : t("realtimeVoice.openAiHelp")}
      </p>

      {provider === "voxtral-elevenlabs" ? (
        <>
          <CatalogSelectField
            currentValue={voice.voxtral_stt_model ?? voice.mistral_stt_model}
            defaultLabel={t("realtimeVoice.optionDefault")}
            id="realtime-voice-voxtral-stt-model"
            label={t("realtimeVoice.voxtralSttModel")}
            loading={optionsQuery.isLoading}
            onChange={(value) => update({ voxtral_stt_model: value })}
            options={options?.voxtral_stt_models ?? []}
            placeholder={t("realtimeVoice.optionDefault")}
          />
          <CatalogSelectField
            currentValue={voice.elevenlabs_tts_model ?? voice.mistral_tts_model}
            defaultLabel={t("realtimeVoice.optionDefault")}
            id="realtime-voice-elevenlabs-tts-model"
            label={t("realtimeVoice.elevenLabsTtsModel")}
            loading={optionsQuery.isLoading}
            onChange={(value) => update({ elevenlabs_tts_model: value })}
            options={options?.elevenlabs_tts_models ?? []}
            placeholder={t("realtimeVoice.optionDefault")}
          />
          <CatalogSelectField
            currentValue={voice.elevenlabs_voice_id}
            defaultLabel={t("realtimeVoice.elevenLabsVoicePlaceholder")}
            disabled={
              !optionsQuery.isLoading &&
              (options?.elevenlabs_voices.length ?? 0) === 0 &&
              !voice.elevenlabs_voice_id
            }
            id="realtime-voice-elevenlabs-voice"
            label={t("realtimeVoice.elevenLabsVoiceId")}
            loading={optionsQuery.isLoading}
            onChange={(value) => update({ elevenlabs_voice_id: value })}
            options={options?.elevenlabs_voices ?? []}
            placeholder={t("realtimeVoice.elevenLabsVoicePlaceholder")}
            requireSelection
          />
          {options?.elevenlabs_voices_error ? (
            <p className="text-destructive text-xs">
              {elevenLabsVoicesErrorLabel(options.elevenlabs_voices_error, t)}
            </p>
          ) : null}
          {options && !options.cascade_keys_configured ? (
            <p className="text-muted-foreground text-xs">
              {t("realtimeVoice.cascadeKeysMissing")}
            </p>
          ) : null}
        </>
      ) : (
        <>
          <CatalogSelectField
            currentValue={voice.openai_model}
            defaultLabel={t("realtimeVoice.optionDefault")}
            id="realtime-voice-openai-model"
            label={t("realtimeVoice.openAiModel")}
            loading={optionsQuery.isLoading}
            onChange={(value) => update({ openai_model: value })}
            options={options?.openai_models ?? []}
            placeholder={t("realtimeVoice.optionDefault")}
          />
          <CatalogSelectField
            currentValue={voice.openai_transcription_model}
            defaultLabel={t("realtimeVoice.optionDefault")}
            id="realtime-voice-openai-transcription-model"
            label={t("realtimeVoice.openAiTranscriptionModel")}
            loading={optionsQuery.isLoading}
            onChange={(value) => update({ openai_transcription_model: value })}
            options={options?.openai_transcription_models ?? []}
            placeholder={t("realtimeVoice.optionDefault")}
          />
          <CatalogSelectField
            currentValue={voice.openai_voice}
            defaultLabel={t("realtimeVoice.optionDefault")}
            id="realtime-voice-openai-voice"
            label={t("realtimeVoice.openAiVoice")}
            loading={optionsQuery.isLoading}
            onChange={(value) => update({ openai_voice: value })}
            options={options?.openai_voices ?? []}
            placeholder={t("realtimeVoice.optionDefault")}
          />
        </>
      )}

      <VoiceSelectField
        id="realtime-voice-register"
        label={t("realtimeVoice.voiceRegisterLabel")}
        onChange={(value) =>
          update({
            voice_register: VOICE_REGISTERS.find(
              (register) => register === value
            ),
          })
        }
        options={[
          { label: t("realtimeVoice.voiceRegisterOff"), value: "off" },
          { label: t("realtimeVoice.voiceRegisterAt"), value: "de-AT" },
          { label: t("realtimeVoice.voiceRegisterDe"), value: "de-DE" },
          { label: t("realtimeVoice.voiceRegisterCh"), value: "de-CH" },
        ]}
        placeholder={t("realtimeVoice.voiceRegisterOff")}
        value={voice.voice_register ?? "off"}
      />
      <p className="text-muted-foreground text-xs">
        {t("realtimeVoice.voiceRegisterHelp")}
      </p>
    </SettingsFormSection>
  );
}

function elevenLabsVoicesErrorLabel(
  code: string,
  t: (key: string) => string
): string {
  switch (code) {
    case "realtime.elevenLabsApiKeyMissing":
      return t("realtimeVoice.errors.elevenLabsApiKeyMissing");
    case "realtime.elevenLabsApiKeyMissingPermissions":
      return t("realtimeVoice.errors.elevenLabsApiKeyMissingPermissions");
    case "realtime.elevenLabsApiKeyInvalid":
      return t("realtimeVoice.errors.elevenLabsApiKeyInvalid");
    default:
      return t("realtimeVoice.errors.elevenLabsVoicesUnavailable");
  }
}

function CatalogSelectField({
  currentValue,
  defaultLabel,
  disabled,
  id,
  label,
  loading,
  onChange,
  options,
  placeholder,
  requireSelection = false,
}: {
  currentValue?: string | null;
  defaultLabel: string;
  disabled?: boolean;
  id: string;
  label: string;
  loading: boolean;
  onChange: (value: string | null) => void;
  options: RealtimeVoiceOption[];
  placeholder: string;
  requireSelection?: boolean;
}) {
  const trimmed = currentValue?.trim() || null;
  const known = options.some((option) => option.id === trimmed);
  const merged: RealtimeVoiceOption[] =
    trimmed && !known
      ? [{ id: trimmed, label: trimmed, meta: null }, ...options]
      : options;
  const selectValue =
    trimmed ?? (requireSelection ? undefined : DEFAULT_OPTION_VALUE);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
      <Label className="shrink-0 sm:w-32 md:w-40" htmlFor={id}>
        {label}
      </Label>
      <Select
        disabled={disabled || loading}
        onValueChange={(value) =>
          onChange(value === DEFAULT_OPTION_VALUE ? null : value)
        }
        value={selectValue}
      >
        <SelectTrigger className="min-w-0 flex-1" id={id}>
          <SelectValue placeholder={loading ? "…" : placeholder} />
        </SelectTrigger>
        <SelectContent>
          {requireSelection ? null : (
            <SelectItem value={DEFAULT_OPTION_VALUE}>{defaultLabel}</SelectItem>
          )}
          {merged.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.meta ? `${option.label} (${option.meta})` : option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function VoiceSelectField({
  id,
  label,
  onChange,
  options,
  placeholder,
  value,
}: {
  id: string;
  label: string;
  onChange: (value: string) => void;
  options: readonly { label: string; value: string }[];
  placeholder: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
      <Label className="shrink-0 sm:w-32 md:w-40" htmlFor={id}>
        {label}
      </Label>
      <Select onValueChange={onChange} value={value}>
        <SelectTrigger className="min-w-0 flex-1" id={id}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
