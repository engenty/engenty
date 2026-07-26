import type { RealtimeVoiceTenantPrefs } from "@engenty/ai-core/browser";
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsFormSection,
} from "@engenty/ui-core";
import type { AiConfig } from "../../lib/admin/ai-settings-api";

interface RealtimeVoiceSettingsCardProps {
  settings: AiConfig;
  t: (key: string) => string;
  updateSettings: <K extends keyof AiConfig>(
    key: K,
    value: AiConfig[K]
  ) => void;
}

const VOICE_REGISTERS = ["de-AT", "de-DE", "de-CH"] as const;

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
          <VoiceTextField
            id="realtime-voice-voxtral-stt-model"
            label={t("realtimeVoice.voxtralSttModel")}
            onChange={(value) => update({ voxtral_stt_model: value })}
            placeholder="voxtral-mini-transcribe-realtime-2602"
            value={voice.voxtral_stt_model ?? voice.mistral_stt_model}
          />
          <VoiceTextField
            id="realtime-voice-elevenlabs-tts-model"
            label={t("realtimeVoice.elevenLabsTtsModel")}
            onChange={(value) => update({ elevenlabs_tts_model: value })}
            placeholder="eleven_flash_v2_5"
            value={voice.elevenlabs_tts_model ?? voice.mistral_tts_model}
          />
          <VoiceTextField
            id="realtime-voice-elevenlabs-voice"
            label={t("realtimeVoice.elevenLabsVoiceId")}
            onChange={(value) => update({ elevenlabs_voice_id: value })}
            placeholder={t("realtimeVoice.elevenLabsVoiceIdPlaceholder")}
            value={voice.elevenlabs_voice_id}
          />
        </>
      ) : (
        <>
          <VoiceTextField
            id="realtime-voice-openai-model"
            label={t("realtimeVoice.openAiModel")}
            onChange={(value) => update({ openai_model: value })}
            placeholder="gpt-realtime-2"
            value={voice.openai_model}
          />
          <VoiceTextField
            id="realtime-voice-openai-transcription-model"
            label={t("realtimeVoice.openAiTranscriptionModel")}
            onChange={(value) => update({ openai_transcription_model: value })}
            placeholder="gpt-realtime-whisper"
            value={voice.openai_transcription_model}
          />
          <VoiceTextField
            id="realtime-voice-openai-voice"
            label={t("realtimeVoice.openAiVoice")}
            onChange={(value) => update({ openai_voice: value })}
            placeholder="marin"
            value={voice.openai_voice}
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

function VoiceTextField({
  id,
  label,
  onChange,
  placeholder,
  value,
}: {
  id: string;
  label: string;
  onChange: (value: string | null) => void;
  placeholder: string;
  value?: string | null;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
      <Label className="shrink-0 sm:w-32 md:w-40" htmlFor={id}>
        {label}
      </Label>
      <Input
        className="min-w-0 flex-1"
        id={id}
        onChange={(event) => onChange(event.target.value.trim() || null)}
        placeholder={placeholder}
        value={value ?? ""}
      />
    </div>
  );
}
