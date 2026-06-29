import { useTranslation } from "@engenty/i18n/ui";
import { SettingsFormSection } from "@engenty/ui-core";
import { RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { COLOR_SETS_PRESETS } from "@/lib/appearance-constants";
import { cn } from "@/lib/utils";

interface ColorItemProps {
  description: string;
  label: string;
  onChange: (val: string) => void;
  value: string;
}

function normalizeHexForPicker(hex: string): string {
  if (/^#[0-9A-Fa-f]{3}$/.test(hex)) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
    return hex;
  }
  return "#ffffff";
}

function ColorItem({ label, description, value, onChange }: ColorItemProps) {
  const colorInputRef = useRef<HTMLInputElement>(null);
  const [typedValue, setTypedValue] = useState(value);

  // Sync with external prop updates (like Reset)
  useEffect(() => {
    setTypedValue(value);
  }, [value]);

  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTypedValue(val);

    // Apply color immediately if it's a valid hex code
    if (/^#[0-9A-Fa-f]{3}$|^#[0-9A-Fa-f]{6}$/.test(val)) {
      onChange(val);
    }
  };

  const handleBlur = () => {
    // Revert to valid value if current input is invalid
    if (!/^#[0-9A-Fa-f]{3}$|^#[0-9A-Fa-f]{6}$/.test(typedValue)) {
      setTypedValue(value);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-background p-3.5">
      <div className="flex min-w-0 flex-col">
        <span className="font-semibold text-foreground text-sm">{label}</span>
        <span className="text-muted-foreground text-xs">{description}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          className="relative h-8 w-8 shrink-0 cursor-pointer rounded-full border border-border shadow-xs transition-transform focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary active:scale-95"
          onClick={() => colorInputRef.current?.click()}
          style={{ backgroundColor: value }}
          type="button"
        >
          <input
            className="pointer-events-none absolute inset-0 h-full w-full cursor-pointer border-0 p-0 opacity-0"
            onChange={(e) => onChange(e.target.value)}
            ref={colorInputRef}
            type="color"
            value={normalizeHexForPicker(value)}
          />
        </button>
        <input
          className="w-20 rounded-md border border-input bg-card px-2 py-1.5 text-center font-mono text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          onBlur={handleBlur}
          onChange={handleHexChange}
          type="text"
          value={typedValue}
        />
      </div>
    </div>
  );
}

interface AppearanceColorsSectionProps {
  background: string;
  contrast: string;
  onChangeBackground: (val: string) => void;
  onChangeContrast: (val: string) => void;
  onChangePrimary: (val: string) => void;
  onChangeSecondary: (val: string) => void;
  onChangeSidebarColor: (val: string) => void;
  onResetColors: () => void;
  primary: string;
  secondary: string;
  sidebarColor: string;
}

export function AppearanceColorsSection({
  primary,
  secondary,
  background,
  contrast,
  sidebarColor,
  onChangePrimary,
  onChangeSecondary,
  onChangeBackground,
  onChangeContrast,
  onChangeSidebarColor,
  onResetColors,
}: AppearanceColorsSectionProps) {
  const { t } = useTranslation("common");

  const titleNode = (
    <div className="flex w-full items-center justify-between">
      <span>{t("settings.colorsTitle")}</span>
      <button
        className="flex items-center gap-1.5 font-medium text-muted-foreground text-xs transition-colors hover:text-foreground"
        onClick={onResetColors}
        type="button"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        {t("settings.resetToDefault")}
      </button>
    </div>
  );

  const colorSets = COLOR_SETS_PRESETS.map((preset) => ({
    id: preset.id,
    nameKey: preset.nameKey,
    primary: preset.light.primary,
    secondary: preset.light.secondary,
    background: preset.light.background,
    sidebar: preset.light.sidebar,
  }));

  return (
    <SettingsFormSection
      description={t("settings.colorsDescription")}
      title={titleNode}
    >
      <div className="space-y-6">
        {/* Preset Color Sets */}
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="font-medium text-foreground text-sm">
              {t("settings.colorTone")}
            </div>
            <div className="flex flex-wrap gap-3">
              {colorSets.map((set) => {
                const isActive =
                  primary === set.primary &&
                  secondary === set.secondary &&
                  background === set.background &&
                  sidebarColor === set.sidebar;
                return (
                  <button
                    className={cn(
                      "flex items-center gap-2 rounded-full border px-3 py-1.5 font-medium text-xs shadow-xs transition-all",
                      isActive
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-card text-muted-foreground hover:bg-accent"
                    )}
                    key={set.id}
                    onClick={() => {
                      onChangePrimary(set.primary);
                      onChangeSecondary(set.secondary);
                      onChangeBackground(set.background);
                      onChangeSidebarColor(set.sidebar);
                    }}
                    type="button"
                  >
                    <span className="flex shrink-0 items-center -space-x-1">
                      <span
                        className="h-3 w-3 rounded-full border border-black/10 shadow-inner"
                        style={{ backgroundColor: set.primary }}
                      />
                      <span
                        className="h-3 w-3 rounded-full border border-black/10 shadow-inner"
                        style={{ backgroundColor: set.secondary }}
                      />
                      <span
                        className="h-3 w-3 rounded-full border border-black/10 shadow-inner"
                        style={{ backgroundColor: set.background }}
                      />
                      <span
                        className="h-3 w-3 rounded-full border border-black/10 shadow-inner"
                        style={{ backgroundColor: set.sidebar }}
                      />
                    </span>
                    <span>{t(set.nameKey)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Contrast Slider */}
          <div className="space-y-2 rounded-lg border bg-background p-4">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground text-sm">
                Theme Contrast Scalar
              </span>
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground text-xs">
                {Number(contrast).toFixed(2)}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground text-xs">0.8 (Low)</span>
              <input
                className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-secondary accent-primary"
                max="2.0"
                min="0.8"
                onChange={(e) => onChangeContrast(e.target.value)}
                step="0.05"
                type="range"
                value={contrast}
              />
              <span className="text-muted-foreground text-xs">2.0 (High)</span>
            </div>
          </div>
        </div>

        {/* Custom Colors Grid */}
        <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2 sm:pt-0">
          <ColorItem
            description={t("settings.colorPrimaryDesc")}
            label={t("settings.colorPrimaryLabel")}
            onChange={onChangePrimary}
            value={primary}
          />
          <ColorItem
            description={t("settings.colorSecondaryDesc")}
            label={t("settings.colorSecondaryLabel")}
            onChange={onChangeSecondary}
            value={secondary}
          />
          <ColorItem
            description={t("settings.colorBackgroundDesc")}
            label={t("settings.colorBackgroundLabel")}
            onChange={onChangeBackground}
            value={background}
          />
          <ColorItem
            description={t("settings.colorSidebarDesc")}
            label={t("settings.colorSidebarLabel")}
            onChange={onChangeSidebarColor}
            value={sidebarColor}
          />
        </div>
      </div>
    </SettingsFormSection>
  );
}
