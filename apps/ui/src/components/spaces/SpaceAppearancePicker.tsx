/**
 * Colour swatches plus Initials / Emoji / Upload — one panel for both the
 * create-row popover and the settings dialog, so those two surfaces cannot
 * disagree about what a space tile is.
 */
import { isSpaceImageIcon, SpaceIconFace } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import {
  cn,
  EmojiIconChooserContent,
  type EmojiIconChooserLabels,
  FileInput,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@engenty/ui-core";
import { useState } from "react";
import {
  SPACE_ICONS,
  type SpaceAppearanceValue,
  SpaceColorSwatches,
} from "./SpaceAppearanceFields";
import { spaceIconFromImageFile } from "./space-icon-image";

type IconTab = "emoji" | "initials" | "upload";

function tabForIcon(icon: string | null): IconTab {
  if (!icon) {
    return "initials";
  }
  return isSpaceImageIcon(icon) ? "upload" : "emoji";
}

function spaceEmojiPickerLocale(language: string): "de" | "en" {
  return language.startsWith("de") ? "de" : "en";
}

function spaceIconChooserLabels(
  t: (key: string) => string
): EmojiIconChooserLabels {
  return {
    addIcon: t("spaces.setup.chooseIcon"),
    apply: t("spaces.setup.iconPicker.apply"),
    browseAll: t("spaces.setup.iconPicker.browse"),
    gridAriaLabel: t("spaces.setup.iconLabel"),
    inputPlaceholder: t("spaces.setup.iconPicker.placeholder"),
    noEmojiFound: t("spaces.setup.iconPicker.empty"),
    quickPicks: t("spaces.setup.iconPicker.quick"),
    remove: t("spaces.setup.iconPicker.remove"),
    selectEmoji: t("spaces.setup.iconPicker.select"),
  };
}

export function SpaceAppearancePicker({
  name,
  onChange,
  value,
}: {
  name: string;
  onChange: (
    update: (previous: SpaceAppearanceValue) => SpaceAppearanceValue
  ) => void;
  value: SpaceAppearanceValue;
}) {
  const { t, i18n } = useTranslation("common");
  const [tab, setTab] = useState<IconTab>(() => tabForIcon(value.icon));
  const [uploadError, setUploadError] = useState(false);
  const [uploading, setUploading] = useState(false);

  const setTabAndIcon = (next: IconTab) => {
    setTab(next);
    if (next === "initials") {
      onChange((previous) => ({ ...previous, icon: null }));
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="space-y-2">
        <p className="font-medium text-sm">{t("spaces.setup.chooseColor")}</p>
        <SpaceColorSwatches
          onChange={(color) => onChange((previous) => ({ ...previous, color }))}
          value={value.color}
        />
      </div>

      <Tabs
        onValueChange={(next) => {
          if (next === "emoji" || next === "initials" || next === "upload") {
            setTabAndIcon(next);
          }
        }}
        value={tab}
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="initials">
            {t("spaces.setup.iconTabs.initials")}
          </TabsTrigger>
          <TabsTrigger value="emoji">
            {t("spaces.setup.iconTabs.emoji")}
          </TabsTrigger>
          <TabsTrigger value="upload">
            {t("spaces.setup.iconTabs.upload")}
          </TabsTrigger>
        </TabsList>

        <TabsContent className="pt-3" value="initials">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl font-semibold text-sm",
                value.color
                  ? "text-white"
                  : "border border-border bg-muted text-foreground"
              )}
              style={value.color ? { backgroundColor: value.color } : undefined}
            >
              <SpaceIconFace icon={null} name={name || "?"} />
            </span>
            <p className="text-muted-foreground text-xs">
              {t("spaces.setup.iconTabs.initialsHint")}
            </p>
          </div>
        </TabsContent>

        <TabsContent className="pt-3" value="emoji">
          <EmojiIconChooserContent
            labels={spaceIconChooserLabels(t)}
            locale={spaceEmojiPickerLocale(i18n.language)}
            onApply={(icon) => onChange((previous) => ({ ...previous, icon }))}
            presets={SPACE_ICONS}
            showRemove={false}
            value={isSpaceImageIcon(value.icon) ? null : value.icon}
          />
        </TabsContent>

        <TabsContent className="pt-3" value="upload">
          <div className="space-y-3">
            {isSpaceImageIcon(value.icon) ? (
              <span
                className={cn(
                  "flex size-16 overflow-hidden rounded-xl",
                  value.color ? "" : "border border-border bg-muted"
                )}
                style={
                  value.color ? { backgroundColor: value.color } : undefined
                }
              >
                <SpaceIconFace icon={value.icon} name={name || "?"} />
              </span>
            ) : null}
            <p className="text-muted-foreground text-xs">
              {t("spaces.setup.iconTabs.uploadHint")}
            </p>
            <FileInput
              accept="image/png,image/jpeg,image/webp,image/gif"
              disabled={uploading}
              emptyLabel={t("spaces.setup.iconTabs.uploadEmpty")}
              onFileChange={async (file) => {
                if (!file) {
                  return;
                }
                setUploadError(false);
                setUploading(true);
                try {
                  const icon = await spaceIconFromImageFile(file);
                  onChange((previous) => ({ ...previous, icon }));
                } catch {
                  setUploadError(true);
                } finally {
                  setUploading(false);
                }
              }}
              selectLabel={t("spaces.setup.iconTabs.uploadSelect")}
            />
            {uploadError ? (
              <p className="text-destructive text-xs">
                {t("spaces.setup.iconTabs.uploadError")}
              </p>
            ) : null}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
