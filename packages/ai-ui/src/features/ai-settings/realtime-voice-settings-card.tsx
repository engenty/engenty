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

export function RealtimeVoiceSettingsCard({
  settings,
  t,
  updateSettings,
}: RealtimeVoiceSettingsCardProps) {
  const voice = settings.realtime_voice ?? {
    provider: "openai" as const,
    openai_model: "gpt-realtime-2",
    openai_transcription_model: "gpt-realtime-whisper",
    openai_voice: "marin",
    mistral_stt_model: "voxtral-mini-transcribe-realtime-2602",
    mistral_chat_model: "mistral/voxtral-small-latest",
    mistral_tts_model: "voxtral-mini-tts-2603",
  };
  const provider = voice.provider ?? "openai";

  return (
    <SettingsFormSection
      description={t("realtimeVoice.description")}
      title={t("realtimeVoice.title")}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <Label
          className="shrink-0 sm:w-32 md:w-40"
          htmlFor="realtime-voice-provider"
        >
          {t("realtimeVoice.providerLabel")}
        </Label>
        <Select
          onValueChange={(value) =>
            updateSettings("realtime_voice", {
              ...voice,
              provider: value === "mistral" ? "mistral" : "openai",
            })
          }
          value={provider}
        >
          <SelectTrigger
            className="min-w-0 flex-1"
            id="realtime-voice-provider"
          >
            <SelectValue placeholder={t("realtimeVoice.providerPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="openai">
              {t("realtimeVoice.providerOpenAi")}
            </SelectItem>
            <SelectItem value="mistral">
              {t("realtimeVoice.providerMistral")}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p className="text-muted-foreground text-xs">
        {provider === "mistral"
          ? t("realtimeVoice.mistralPipelineHelp")
          : t("realtimeVoice.openAiHelp")}
      </p>

      {provider === "mistral" ? (
        <>
          <VoiceTextField
            id="realtime-voice-mistral-stt-model"
            label={t("realtimeVoice.mistralSttModel")}
            onChange={(value) =>
              updateSettings("realtime_voice", {
                ...voice,
                mistral_stt_model: value,
              })
            }
            placeholder="voxtral-mini-transcribe-realtime-2602"
            value={voice.mistral_stt_model}
          />
          <VoiceTextField
            id="realtime-voice-mistral-chat-model"
            label={t("realtimeVoice.mistralChatModel")}
            onChange={(value) =>
              updateSettings("realtime_voice", {
                ...voice,
                mistral_chat_model: value,
              })
            }
            placeholder="mistral/voxtral-small-latest"
            value={voice.mistral_chat_model}
          />
          <VoiceTextField
            id="realtime-voice-mistral-tts-model"
            label={t("realtimeVoice.mistralTtsModel")}
            onChange={(value) =>
              updateSettings("realtime_voice", {
                ...voice,
                mistral_tts_model: value,
              })
            }
            placeholder="voxtral-mini-tts-2603"
            value={voice.mistral_tts_model}
          />
        </>
      ) : (
        <>
          <VoiceTextField
            id="realtime-voice-openai-model"
            label={t("realtimeVoice.openAiModel")}
            onChange={(value) =>
              updateSettings("realtime_voice", {
                ...voice,
                openai_model: value,
              })
            }
            placeholder="gpt-realtime-2"
            value={voice.openai_model}
          />
          <VoiceTextField
            id="realtime-voice-openai-transcription-model"
            label={t("realtimeVoice.openAiTranscriptionModel")}
            onChange={(value) =>
              updateSettings("realtime_voice", {
                ...voice,
                openai_transcription_model: value,
              })
            }
            placeholder="gpt-realtime-whisper"
            value={voice.openai_transcription_model}
          />
          <VoiceTextField
            id="realtime-voice-openai-voice"
            label={t("realtimeVoice.openAiVoice")}
            onChange={(value) =>
              updateSettings("realtime_voice", {
                ...voice,
                openai_voice: value,
              })
            }
            placeholder="marin"
            value={voice.openai_voice}
          />
        </>
      )}
    </SettingsFormSection>
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
