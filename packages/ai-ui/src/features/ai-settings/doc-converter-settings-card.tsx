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
import type { DocConverterAvailability } from "../../lib/admin/doc-converter-availability-api";

const DEFAULT_GEMINI_MODEL = "google/gemini-2.5-flash";

interface DocConverterSettingsCardProps {
  availability: DocConverterAvailability | undefined;
  availabilityLoading: boolean;
  settings: AiConfig;
  t: (key: string) => string;
  updateSettings: <K extends keyof AiConfig>(
    key: K,
    value: AiConfig[K]
  ) => void;
}

export function DocConverterSettingsCard({
  availability,
  availabilityLoading,
  settings,
  t,
  updateSettings,
}: DocConverterSettingsCardProps) {
  const dc = settings.doc_converter ?? {
    provider: "local" as const,
    gemini_model: null,
  };
  const provider = dc.provider ?? "local";

  return (
    <SettingsFormSection
      description={t("sections.docConverterDesc")}
      title={t("sections.docConverter")}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <Label
          className="shrink-0 sm:w-32 md:w-40"
          htmlFor="doc-converter-provider"
        >
          {t("docConverter.providerLabel")}
        </Label>
        <Select
          onValueChange={(value) =>
            updateSettings("doc_converter", {
              ...dc,
              provider:
                value === "llamaparse" ||
                value === "gemini" ||
                value === "liteparse" ||
                value === "local"
                  ? value
                  : "local",
            })
          }
          value={provider}
        >
          <SelectTrigger
            className="min-w-0 flex-1"
            id="doc-converter-provider"
            size="sm"
          >
            <SelectValue placeholder={t("docConverter.providerPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="local">
              {t("docConverter.providerLocal")}
            </SelectItem>
            <SelectItem value="liteparse">
              {t("docConverter.providerLiteParseLocal")}
            </SelectItem>
            <SelectItem value="llamaparse">
              {t("docConverter.providerLlamaParse")}
            </SelectItem>
            <SelectItem value="gemini">
              {t("docConverter.providerGemini")}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p className="text-muted-foreground text-xs">
        {t("docConverter.providerHelp")}
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <Label
          className="shrink-0 sm:w-32 md:w-40"
          htmlFor="doc-converter-gemini-model"
        >
          {t("docConverter.geminiModelLabel")}
        </Label>
        <Input
          className="h-8 min-w-0 flex-1"
          id="doc-converter-gemini-model"
          onChange={(e) =>
            updateSettings("doc_converter", {
              ...dc,
              gemini_model: e.target.value.trim() || null,
            })
          }
          placeholder={DEFAULT_GEMINI_MODEL}
          value={dc.gemini_model ?? ""}
        />
      </div>
      <p className="text-muted-foreground text-xs">
        {t("docConverter.geminiModelHelp")}
      </p>

      <div className="border-t pt-3 text-muted-foreground text-xs">
        <p className="font-medium text-foreground">
          {t("docConverter.availabilityHeading")}
        </p>
        {availabilityLoading ? (
          <p>{t("docConverter.availabilityLoading")}</p>
        ) : (
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            <li>
              LlamaParse:{" "}
              {availability?.llamaparse
                ? t("docConverter.backendReady")
                : t("docConverter.backendMissingLlama")}
            </li>
            <li>
              Gemini (AI Gateway):{" "}
              {availability?.gemini
                ? t("docConverter.backendReady")
                : t("docConverter.backendMissingGemini")}
            </li>
          </ul>
        )}
      </div>
    </SettingsFormSection>
  );
}
