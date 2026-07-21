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

const DEFAULT_REALTIME_MODEL = "gpt-realtime-2";
const DEFAULT_REALTIME_TRANSCRIPTION_MODEL = "gpt-realtime-whisper";
const DEFAULT_REALTIME_VOICE = "marin";

/** OpenAI Realtime voice ids. Extend as OpenAI adds voices. */
const VOICE_OPTIONS = [
  "marin",
  "cedar",
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
] as const;

interface RealtimeVoiceCardProps {
  settings: AiConfig;
  t: (key: string, opts?: Record<string, unknown>) => string;
  updateSettings: <K extends keyof AiConfig>(
    key: K,
    value: AiConfig[K]
  ) => void;
}

export function RealtimeVoiceCard({
  settings,
  t,
  updateSettings,
}: RealtimeVoiceCardProps) {
  const rv = settings.realtime_voice ?? null;

  const patch = (next: Partial<NonNullable<AiConfig["realtime_voice"]>>) => {
    updateSettings("realtime_voice", { ...rv, ...next });
  };

  return (
    <SettingsFormSection
      description={t("voice.description")}
      title={t("voice.title")}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <Label className="shrink-0 sm:w-32 md:w-40" htmlFor="voice-voice">
          {t("voice.voiceLabel")}
        </Label>
        <Select
          onValueChange={(value) => patch({ openai_voice: value || null })}
          value={rv?.openai_voice ?? ""}
        >
          <SelectTrigger className="min-w-0 flex-1" id="voice-voice" size="sm">
            <SelectValue
              placeholder={t("voice.inheritHint", {
                value: DEFAULT_REALTIME_VOICE,
              })}
            />
          </SelectTrigger>
          <SelectContent>
            {VOICE_OPTIONS.map((voice) => (
              <SelectItem key={voice} value={voice}>
                {voice}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <Label className="shrink-0 sm:w-32 md:w-40" htmlFor="voice-model">
          {t("voice.modelLabel")}
        </Label>
        <Input
          className="h-8 min-w-0 flex-1"
          id="voice-model"
          onChange={(e) =>
            patch({ openai_model: e.target.value.trim() || null })
          }
          placeholder={DEFAULT_REALTIME_MODEL}
          value={rv?.openai_model ?? ""}
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <Label
          className="shrink-0 sm:w-32 md:w-40"
          htmlFor="voice-transcription"
        >
          {t("voice.transcriptionLabel")}
        </Label>
        <Input
          className="h-8 min-w-0 flex-1"
          id="voice-transcription"
          onChange={(e) =>
            patch({ openai_transcription_model: e.target.value.trim() || null })
          }
          placeholder={DEFAULT_REALTIME_TRANSCRIPTION_MODEL}
          value={rv?.openai_transcription_model ?? ""}
        />
      </div>

      <p className="text-muted-foreground text-xs">{t("voice.help")}</p>
    </SettingsFormSection>
  );
}
